// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Names} from "./Names.sol";
import {IQuillResolver} from "./interfaces/IQuill.sol";

/// @title QuillRegistryRegistrar — the `.quill` namespace as time-limited ERC-721 registrations.
/// @notice tokenId == uint256(node). Ownership of the NFT grants naming rights
///         only while the registration is active: an expired NFT is a receipt,
///         not a name. Every registration and every transfer bumps the record
///         epoch, which scopes resolver records and primary-name references.
contract QuillRegistryRegistrar is Initializable, ERC721Upgradeable, Ownable2StepUpgradeable, UUPSUpgradeable {
    uint256 public constant YEAR = 365 days;
    uint256 public constant GRACE_PERIOD = 90 days;
    uint256 public constant MAX_YEARS = 5;
    /// @dev No registration may run further than this from now (renewals included).
    uint256 public constant MAX_HORIZON = 5 * 365 days + 30 days;

    uint8 public constant STATE_AVAILABLE = 0;
    uint8 public constant STATE_ACTIVE = 1;
    uint8 public constant STATE_GRACE = 2;

    address public bootstrapper;
    address public controller;
    address public resolver;

    mapping(bytes32 => uint256) public expiresAt;
    mapping(bytes32 => uint256) public recordEpoch;
    mapping(bytes32 => string) public labelOf;
    mapping(bytes32 => bool) public reserved;

    event NameRegistered(bytes32 indexed node, string label, address indexed owner, uint256 expiresAt);
    event NameRenewed(bytes32 indexed node, uint256 expiresAt);
    event RecordEpochChanged(bytes32 indexed node, uint256 epoch);
    event BootstrapClosed(address indexed controller);
    event ResolverChanged(address indexed resolver);

    error OnlyController();
    error OnlyBootstrapper();
    error BootstrapClosedAlready();
    error InvalidLabel();
    error InvalidYears();
    error Unavailable();
    error NotRenewable();
    error HorizonExceeded();
    error ZeroAddress();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin) external initializer {
        if (admin == address(0)) revert ZeroAddress();
        __ERC721_init("Quill Name Service", "QUILL");
        __Ownable_init(admin);
        __Ownable2Step_init();
        bootstrapper = msg.sender;
    }

    /// @notice One-time wiring by the deployer: names the controller and
    ///         reserves labels that can never be registered.
    function bootstrap(address controller_, string[] calldata labels) external {
        if (msg.sender != bootstrapper) revert OnlyBootstrapper();
        if (controller != address(0)) revert BootstrapClosedAlready();
        if (controller_ == address(0)) revert ZeroAddress();
        controller = controller_;
        for (uint256 i = 0; i < labels.length; i++) {
            if (!Names.valid(labels[i])) revert InvalidLabel();
            bytes32 node = Names.node(labels[i]);
            reserved[node] = true;
            labelOf[node] = labels[i];
        }
        emit BootstrapClosed(controller_);
    }

    /// @notice The resolver whose `avatar` record illustrates tokenURI.
    function setResolver(address resolver_) external onlyOwner {
        resolver = resolver_;
        emit ResolverChanged(resolver_);
    }

    // ---------------------------------------------------------------- reads

    function rootNode() public pure returns (bytes32) {
        return Names.rootNode();
    }

    function nameState(bytes32 node) public view returns (uint8) {
        uint256 exp = expiresAt[node];
        if (exp == 0) return STATE_AVAILABLE;
        if (block.timestamp < exp) return STATE_ACTIVE;
        if (block.timestamp < exp + GRACE_PERIOD) return STATE_GRACE;
        return STATE_AVAILABLE;
    }

    /// @notice The NFT owner while the registration is active, else zero.
    function activeOwner(bytes32 node) public view returns (address) {
        if (nameState(node) != STATE_ACTIVE) return address(0);
        return _ownerOf(uint256(node));
    }

    // -------------------------------------------------------------- writes

    modifier onlyController() {
        if (msg.sender != controller || controller == address(0)) revert OnlyController();
        _;
    }

    function register(string calldata label, address owner_, uint256 years_) external onlyController returns (bytes32 node) {
        if (!Names.valid(label)) revert InvalidLabel();
        if (years_ == 0 || years_ > MAX_YEARS) revert InvalidYears();
        if (owner_ == address(0)) revert ZeroAddress();
        node = Names.node(label);
        if (reserved[node] || nameState(node) != STATE_AVAILABLE) revert Unavailable();

        uint256 tokenId = uint256(node);
        // An expired registration leaves its NFT with the previous holder as a
        // receipt; a new registration retires it.
        if (_ownerOf(tokenId) != address(0)) _burn(tokenId);
        _mint(owner_, tokenId);

        uint256 exp = block.timestamp + years_ * YEAR;
        expiresAt[node] = exp;
        labelOf[node] = label;
        uint256 epoch = ++recordEpoch[node];
        emit RecordEpochChanged(node, epoch);
        emit NameRegistered(node, label, owner_, exp);
    }

    /// @notice Extends an active or grace-period registration. Owner and
    ///         records are kept — the epoch does not change.
    function renew(bytes32 node, uint256 years_) external onlyController {
        if (years_ == 0 || years_ > MAX_YEARS) revert InvalidYears();
        uint8 state = nameState(node);
        if (state != STATE_ACTIVE && state != STATE_GRACE) revert NotRenewable();
        uint256 exp = expiresAt[node] + years_ * YEAR;
        if (exp > block.timestamp + MAX_HORIZON) revert HorizonExceeded();
        expiresAt[node] = exp;
        emit NameRenewed(node, exp);
    }

    /// @dev Every transfer (including to self) opens a new record epoch, so
    ///      the previous owner's records and primary-name reference stop resolving.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = super._update(to, tokenId, auth);
        if (from != address(0) && to != address(0)) {
            bytes32 node = bytes32(tokenId);
            uint256 epoch = ++recordEpoch[node];
            emit RecordEpochChanged(node, epoch);
        }
    }

    // ------------------------------------------------------------- metadata

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        bytes32 node = bytes32(tokenId);
        string memory image = "";
        if (resolver != address(0)) {
            try IQuillResolver(resolver).text(node, "avatar") returns (string memory v) {
                image = v;
            } catch {}
        }
        bytes memory json = abi.encodePacked(
            '{"name":"',
            Names.full(labelOf[node]),
            '","description":"Independent QUILL time-limited registration; no automatic wallet compatibility.","expiresAt":',
            Strings.toString(expiresAt[node]),
            ',"status":',
            Strings.toString(nameState(node)),
            ',"epoch":',
            Strings.toString(recordEpoch[node]),
            ',"image":"',
            _escape(image),
            '"}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(json));
    }

    /// @dev Minimal JSON string escaping for a user-supplied record value.
    function _escape(string memory s) private pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory out = new bytes(b.length * 2);
        uint256 n = 0;
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            if (c == '"' || c == "\\") {
                out[n++] = "\\";
                out[n++] = c;
            } else if (uint8(c) < 0x20) {
                out[n++] = " ";
            } else {
                out[n++] = c;
            }
        }
        assembly {
            mstore(out, n)
        }
        return string(out);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
