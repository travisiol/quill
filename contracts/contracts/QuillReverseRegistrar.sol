// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Names} from "./Names.sol";
import {IQuillRegistry, IQuillResolver} from "./interfaces/IQuill.sol";

/// @title QuillReverseRegistrar — one primary name per wallet, valid only while it points back.
/// @notice A wallet may claim a name as primary only if it is the active owner
///         and the name's address record resolves to that wallet. The claim
///         stores the record epoch; a transfer, expiry or a changed address
///         record makes `primaryNameOf` answer empty again — nothing is ever
///         inferred from NFT ownership alone.
contract QuillReverseRegistrar is Initializable, Ownable2StepUpgradeable, UUPSUpgradeable {
    struct Reference {
        bytes32 node;
        uint256 epoch;
    }

    IQuillRegistry public registry;
    IQuillResolver public resolver;
    mapping(address => Reference) public references;

    event PrimaryNameSet(address indexed wallet, bytes32 indexed node, uint256 epoch);
    event PrimaryNameCleared(address indexed wallet);

    error OnlyActiveOwner();
    error Unresolved();
    error ZeroAddress();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address registry_, address resolver_, address admin) external initializer {
        if (registry_ == address(0) || resolver_ == address(0) || admin == address(0)) revert ZeroAddress();
        __Ownable_init(admin);
        __Ownable2Step_init();
        registry = IQuillRegistry(registry_);
        resolver = IQuillResolver(resolver_);
    }

    function setPrimaryName(bytes32 node) external {
        if (registry.activeOwner(node) != msg.sender) revert OnlyActiveOwner();
        if (resolver.addr(node) != msg.sender) revert Unresolved();
        uint256 epoch = registry.recordEpoch(node);
        references[msg.sender] = Reference({node: node, epoch: epoch});
        emit PrimaryNameSet(msg.sender, node, epoch);
    }

    function clearPrimaryName() external {
        delete references[msg.sender];
        emit PrimaryNameCleared(msg.sender);
    }

    /// @notice `label.quill` while the reference still holds, otherwise "".
    function primaryNameOf(address wallet) external view returns (string memory) {
        Reference memory ref = references[wallet];
        if (ref.node == bytes32(0)) return "";
        if (registry.activeOwner(ref.node) != wallet) return "";
        if (registry.recordEpoch(ref.node) != ref.epoch) return "";
        if (resolver.addr(ref.node) != wallet) return "";
        return Names.full(registry.labelOf(ref.node));
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
