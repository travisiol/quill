// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IControllerLike {
    function commit(bytes32 commitment) external;
    function register(string calldata label, uint256 years_, uint256 maxPriceWei, uint256 deadline, bytes32 secret) external payable;
    function withdrawRefund(address recipient) external;
    function refundCredit(address) external view returns (uint256);
}

/// @dev Test helper: registers with an overpayment, then tries to re-enter
///      withdrawRefund from its receive hook. Also refuses ERC-721 receipt
///      so safeTransferFrom to it fails while plain register() (which mints
///      with _mint, not _safeMint) still works.
contract AdversarialReceiver {
    IControllerLike public immutable controller;
    uint256 public reentered;
    bool public reentryReverted;

    constructor(address controller_) {
        controller = IControllerLike(controller_);
    }

    function commit(bytes32 c) external {
        controller.commit(c);
    }

    function register(string calldata label, uint256 years_, uint256 maxPriceWei, uint256 deadline, bytes32 secret) external payable {
        controller.register{value: msg.value}(label, years_, maxPriceWei, deadline, secret);
    }

    function withdraw() external {
        controller.withdrawRefund(address(this));
    }

    receive() external payable {
        reentered++;
        try controller.withdrawRefund(address(this)) {
            // a successful re-entry would be the bug
        } catch {
            reentryReverted = true;
        }
    }
}
