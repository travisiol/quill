// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Names} from "./Names.sol";
import {IQuillRegistry} from "./interfaces/IQuill.sol";

/// @title QuillController — commit–reveal registration and renewal, paid in ETH.
/// @notice A commitment hides the name for at least MIN_AGE and at most
///         MAX_AGE seconds of chain time; it never reserves it. Overpayment
///         is credited to the payer and withdrawable at any time. Revenue is
///         the balance net of refund liabilities and only ever goes to the
///         treasury. Prices and treasury change behind a two-day delay.
contract QuillController is Initializable, Ownable2StepUpgradeable, UUPSUpgradeable, ReentrancyGuard {
    uint256 public constant MIN_AGE = 60;
    uint256 public constant MAX_AGE = 86400;
    uint256 public constant ADMIN_DELAY = 2 days;
    uint256 public constant MAX_YEARS = 5;

    IQuillRegistry public registry;
    address public treasury;
    /// @dev Yearly price by label length: [3 chars, 4 chars, 5+ chars].
    uint256[3] public prices;
    bool public paused;

    mapping(address => mapping(bytes32 => uint256)) public commitments;
    mapping(address => uint256) public refundCredit;
    uint256 public totalRefundLiabilities;

    uint256[3] public pendingPrices;
    uint256 public priceReadyAt;
    address public pendingTreasury;
    uint256 public treasuryReadyAt;

    event Committed(address indexed registrant, bytes32 indexed commitment, uint256 timestamp);
    event PriceChangeScheduled(uint256[3] prices, uint256 readyAt);
    event PriceChangeExecuted(uint256[3] prices);
    event TreasuryChangeScheduled(address treasury, uint256 readyAt);
    event TreasuryChangeExecuted(address treasury);
    event PauseChanged(bool paused);
    event RefundCredited(address indexed payer, uint256 amount);
    event RefundWithdrawn(address indexed payer, address indexed recipient, uint256 amount);
    event RevenueWithdrawn(address indexed treasury, uint256 amount);

    error InvalidLabel();
    error InvalidYears();
    error Paused();
    error ExistingCommitment();
    error MissingCommitment();
    error CommitmentTooNew();
    error CommitmentExpired();
    error DeadlineExpired();
    error Unavailable();
    error PriceExceeded();
    error Underpaid();
    error NothingToWithdraw();
    error NothingScheduled();
    error DelayNotElapsed();
    error ZeroAddress();
    error TransferFailed();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address registry_, address admin, address treasury_, uint256[3] calldata prices_) external initializer {
        if (registry_ == address(0) || admin == address(0) || treasury_ == address(0)) revert ZeroAddress();
        __Ownable_init(admin);
        __Ownable2Step_init();
        registry = IQuillRegistry(registry_);
        treasury = treasury_;
        prices = prices_;
    }

    // ---------------------------------------------------------------- reads

    function valid(string calldata label) external pure returns (bool) {
        return Names.valid(label);
    }

    function available(string calldata label) public view returns (bool) {
        if (!Names.valid(label)) return false;
        bytes32 node = Names.node(label);
        if (registry.reserved(node)) return false;
        return registry.nameState(node) == 0;
    }

    function quote(string calldata label, uint256 years_) public view returns (uint256) {
        if (!Names.valid(label)) revert InvalidLabel();
        if (years_ == 0 || years_ > MAX_YEARS) revert InvalidYears();
        uint256 len = bytes(label).length;
        uint256 tier = len == 3 ? 0 : (len == 4 ? 1 : 2);
        return prices[tier] * years_;
    }

    /// @notice The commitment is bound to this controller and chain so a
    ///         saved secret cannot be replayed elsewhere.
    function makeCommitment(
        string calldata label,
        address registrant,
        uint256 years_,
        uint256 maxPriceWei,
        uint256 deadline,
        bytes32 secret
    ) public view returns (bytes32) {
        return keccak256(abi.encode(keccak256(bytes(label)), registrant, years_, maxPriceWei, deadline, secret, block.chainid, address(this)));
    }

    // -------------------------------------------------------------- writes

    function commit(bytes32 commitment) external {
        uint256 existing = commitments[msg.sender][commitment];
        if (existing != 0 && block.timestamp <= existing + MAX_AGE) revert ExistingCommitment();
        commitments[msg.sender][commitment] = block.timestamp;
        emit Committed(msg.sender, commitment, block.timestamp);
    }

    function register(string calldata label, uint256 years_, uint256 maxPriceWei, uint256 deadline, bytes32 secret) external payable nonReentrant {
        if (paused) revert Paused();
        bytes32 commitment = makeCommitment(label, msg.sender, years_, maxPriceWei, deadline, secret);
        uint256 committedAt = commitments[msg.sender][commitment];
        if (committedAt == 0) revert MissingCommitment();
        if (block.timestamp < committedAt + MIN_AGE) revert CommitmentTooNew();
        if (block.timestamp > committedAt + MAX_AGE) revert CommitmentExpired();
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (!available(label)) revert Unavailable();
        uint256 price = quote(label, years_);
        if (price > maxPriceWei) revert PriceExceeded();
        if (msg.value < price) revert Underpaid();

        delete commitments[msg.sender][commitment];
        registry.register(label, msg.sender, years_);
        _credit(msg.sender, msg.value - price);
    }

    /// @notice Anyone may pay for a renewal; the owner and records are kept.
    function renew(string calldata label, uint256 years_, uint256 maxPriceWei) external payable nonReentrant {
        if (paused) revert Paused();
        uint256 price = quote(label, years_);
        if (price > maxPriceWei) revert PriceExceeded();
        if (msg.value < price) revert Underpaid();
        registry.renew(Names.node(label), years_);
        _credit(msg.sender, msg.value - price);
    }

    function withdrawRefund(address recipient) external nonReentrant {
        if (recipient == address(0)) revert ZeroAddress();
        uint256 amount = refundCredit[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        refundCredit[msg.sender] = 0;
        totalRefundLiabilities -= amount;
        (bool ok, ) = recipient.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit RefundWithdrawn(msg.sender, recipient, amount);
    }

    /// @notice Sweeps revenue (balance net of refund credits) to the treasury.
    function withdrawRevenue() external nonReentrant {
        uint256 amount = address(this).balance - totalRefundLiabilities;
        if (amount == 0) revert NothingToWithdraw();
        (bool ok, ) = treasury.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit RevenueWithdrawn(treasury, amount);
    }

    // --------------------------------------------------------------- admin

    function schedulePrices(uint256[3] calldata value) external onlyOwner {
        pendingPrices = value;
        priceReadyAt = block.timestamp + ADMIN_DELAY;
        emit PriceChangeScheduled(value, priceReadyAt);
    }

    function executePrices() external {
        if (priceReadyAt == 0) revert NothingScheduled();
        if (block.timestamp < priceReadyAt) revert DelayNotElapsed();
        prices = pendingPrices;
        delete pendingPrices;
        priceReadyAt = 0;
        emit PriceChangeExecuted(prices);
    }

    function scheduleTreasury(address value) external onlyOwner {
        if (value == address(0)) revert ZeroAddress();
        pendingTreasury = value;
        treasuryReadyAt = block.timestamp + ADMIN_DELAY;
        emit TreasuryChangeScheduled(value, treasuryReadyAt);
    }

    function executeTreasury() external {
        if (treasuryReadyAt == 0) revert NothingScheduled();
        if (block.timestamp < treasuryReadyAt) revert DelayNotElapsed();
        treasury = pendingTreasury;
        pendingTreasury = address(0);
        treasuryReadyAt = 0;
        emit TreasuryChangeExecuted(treasury);
    }

    function setPaused(bool value) external onlyOwner {
        paused = value;
        emit PauseChanged(value);
    }

    // ------------------------------------------------------------ internal

    function _credit(address payer, uint256 amount) private {
        if (amount == 0) return;
        refundCredit[payer] += amount;
        totalRefundLiabilities += amount;
        emit RefundCredited(payer, amount);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
