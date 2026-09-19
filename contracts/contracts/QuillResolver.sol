// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IQuillRegistry} from "./interfaces/IQuill.sol";

/// @title QuillResolver — one address and free-text records per name, scoped by record epoch.
/// @notice Only the active owner writes. Reads answer only while the name is
///         active and only for the current epoch: a transfer or a
///         re-registration silently retires the previous owner's records.
contract QuillResolver is Initializable, Ownable2StepUpgradeable, UUPSUpgradeable, IERC165 {
    uint256 public constant MAX_RECORD_BYTES = 512;
    uint256 public constant MAX_KEY_BYTES = 64;

    IQuillRegistry public registry;

    mapping(bytes32 => mapping(uint256 => address)) private _addrs;
    mapping(bytes32 => mapping(uint256 => mapping(string => string))) private _texts;

    event AddrChanged(bytes32 indexed node, uint256 indexed epoch, address addr);
    event TextChanged(bytes32 indexed node, uint256 indexed epoch, string key, string value);

    error OnlyActiveOwner();
    error RecordTooLong();
    error InvalidKey();
    error ZeroAddress();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address registry_, address admin) external initializer {
        if (registry_ == address(0) || admin == address(0)) revert ZeroAddress();
        __Ownable_init(admin);
        __Ownable2Step_init();
        registry = IQuillRegistry(registry_);
    }

    // ---------------------------------------------------------------- reads

    function addr(bytes32 node) external view returns (address) {
        if (registry.nameState(node) != 1) return address(0);
        return _addrs[node][registry.recordEpoch(node)];
    }

    function text(bytes32 node, string calldata key) external view returns (string memory) {
        if (registry.nameState(node) != 1) return "";
        return _texts[node][registry.recordEpoch(node)][key];
    }

    // -------------------------------------------------------------- writes

    function setAddr(bytes32 node, address value) external {
        uint256 epoch = _authorize(node);
        _addrs[node][epoch] = value;
        emit AddrChanged(node, epoch, value);
    }

    function setText(bytes32 node, string calldata key, string calldata value) external {
        if (bytes(key).length == 0 || bytes(key).length > MAX_KEY_BYTES) revert InvalidKey();
        if (bytes(value).length > MAX_RECORD_BYTES) revert RecordTooLong();
        uint256 epoch = _authorize(node);
        _texts[node][epoch][key] = value;
        emit TextChanged(node, epoch, key, value);
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        // ERC-165, addr(bytes32), text(bytes32,string)
        return id == 0x01ffc9a7 || id == 0x3b3b57de || id == 0x59d1d43c;
    }

    function _authorize(bytes32 node) private view returns (uint256 epoch) {
        if (registry.activeOwner(node) != msg.sender) revert OnlyActiveOwner();
        epoch = registry.recordEpoch(node);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
