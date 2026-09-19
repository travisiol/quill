// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Names — label rules and node derivation for the QUILL namespace.
/// @notice A name is `<label>.quill`. Its node is
///         keccak256(rootNode ‖ keccak256(label)) with
///         rootNode = keccak256(bytes32(0) ‖ keccak256("quill")).
library Names {
    string internal constant TLD = "quill";
    uint256 internal constant MIN_LENGTH = 3;
    uint256 internal constant MAX_LENGTH = 32;

    /// @dev 3–32 ASCII letters, digits or hyphens; no leading or trailing
    ///      hyphen; no punycode prefix. Uppercase is rejected — the site
    ///      lowercases before calling.
    function valid(string memory label) internal pure returns (bool) {
        bytes memory b = bytes(label);
        uint256 len = b.length;
        if (len < MIN_LENGTH || len > MAX_LENGTH) return false;
        if (b[0] == "-" || b[len - 1] == "-") return false;
        if (len >= 4 && b[0] == "x" && b[1] == "n" && b[2] == "-" && b[3] == "-") return false;
        for (uint256 i = 0; i < len; i++) {
            bytes1 c = b[i];
            bool ok = (c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c == "-";
            if (!ok) return false;
        }
        return true;
    }

    function rootNode() internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(bytes32(0), keccak256(bytes(TLD))));
    }

    function node(string memory label) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(rootNode(), keccak256(bytes(label))));
    }

    function full(string memory label) internal pure returns (string memory) {
        return string.concat(label, ".", TLD);
    }
}
