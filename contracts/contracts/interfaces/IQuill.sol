// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IQuillRegistry {
    function rootNode() external pure returns (bytes32);
    function controller() external view returns (address);
    function nameState(bytes32 node) external view returns (uint8);
    function activeOwner(bytes32 node) external view returns (address);
    function expiresAt(bytes32 node) external view returns (uint256);
    function recordEpoch(bytes32 node) external view returns (uint256);
    function labelOf(bytes32 node) external view returns (string memory);
    function reserved(bytes32 node) external view returns (bool);
    function register(string calldata label, address owner, uint256 years_) external returns (bytes32 node);
    function renew(bytes32 node, uint256 years_) external;
}

interface IQuillResolver {
    function registry() external view returns (address);
    function addr(bytes32 node) external view returns (address);
    function text(bytes32 node, string calldata key) external view returns (string memory);
}
