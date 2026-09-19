// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Compiled so the deploy scripts can construct ERC-1967 proxies from artifacts.
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @dev Named wrapper so the artifact is unambiguous in this package.
contract QuillProxy is ERC1967Proxy {
    constructor(address implementation, bytes memory data) ERC1967Proxy(implementation, data) {}
}
