// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FlockLaunchpad.sol";

/// Mock WETH + Uniswap router/factory so we can test graduation locally.
contract MockWETH {
    function deposit() external payable {}
}

contract MockFactory {
    address public pair = address(0xBEEF);
    function getPair(address, address) external view returns (address) { return pair; }
}

contract MockRouter {
    MockFactory public immutable _factory = new MockFactory();
    MockWETH public immutable _weth = new MockWETH();
    uint256 public receivedEth;
    uint256 public receivedTokens;
    address public lpRecipient;

    function factory() external view returns (address) { return address(_factory); }
    function WETH() external view returns (address) { return address(_weth); }

    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint,
        uint,
        address to,
        uint
    ) external payable returns (uint, uint, uint) {
        FlockToken(token).transferFrom(msg.sender, address(this), amountTokenDesired);
        receivedEth = msg.value;
        receivedTokens = amountTokenDesired;
        lpRecipient = to;
        return (amountTokenDesired, msg.value, 1e18);
    }
}

contract FlockLaunchpadTest is Test {
    FlockLaunchpad pad;
    MockRouter router;
    address treasury = address(0xFEE);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    uint256 constant V_ETH = 1 ether;
    uint256 constant V_TOK = 1_073_000_000 ether;

    function setUp() public {
        router = new MockRouter();
        pad = new FlockLaunchpad(address(router), treasury, V_ETH, V_TOK, 100, 0.05 ether, 2000);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function _create() internal returns (address) {
        vm.prank(alice);
        return pad.createToken("Robin Coin", "ROBIN", "ipfs://meta");
    }

    function test_create() public {
        address t = _create();
        assertEq(pad.tokenCount(), 1);
        assertEq(FlockToken(t).balanceOf(address(pad)), 1_000_000_000 ether);
        (address creator,,,,,, bool grad) = pad.curves(t);
        assertEq(creator, alice);
        assertFalse(grad);
    }

    function test_buy_math_and_fee() public {
        address t = _create();
        uint256 treasuryBefore = treasury.balance;

        vm.prank(bob);
        pad.buy{value: 1 ether}(t, 0);

        // 1% fee -> 0.99 ETH into curve
        uint256 ethIn = 0.99 ether;
        uint256 k = V_ETH * V_TOK;
        uint256 expected = V_TOK - (k + (V_ETH + ethIn) - 1) / (V_ETH + ethIn);

        assertEq(FlockToken(t).balanceOf(bob), expected);
        // 1% fee split: 50% creator, 20% buyback-burn, 30% treasury
        assertEq(treasury.balance - treasuryBefore, 0.003 ether);
        assertEq(pad.creatorFees(alice), 0.005 ether);
        // the burn happened: dead address holds tokens bought with 0.002 ETH
        assertGt(FlockToken(t).balanceOf(pad.LP_BURN()), 0);
        // ~534M tokens for the first 1 ETH on this curve
        assertApproxEqRel(expected, 533_849_246 ether, 0.01e18);
    }

    function test_sell_roundtrip_never_profits() public {
        address t = _create();
        vm.startPrank(bob);
        pad.buy{value: 1 ether}(t, 0);
        uint256 bal = FlockToken(t).balanceOf(bob);
        FlockToken(t).approve(address(pad), bal);
        uint256 ethBefore = bob.balance;
        pad.sell(t, bal, 0);
        vm.stopPrank();
        // Bought with 1 ETH, must get back less (two 1% fees)
        uint256 got = bob.balance - ethBefore;
        assertLt(got, 1 ether);
        assertGt(got, 0.97 ether);
        // Contract is not drained below its accounting
        (, , , uint128 realEth, uint128 sold,,) = pad.curves(t);
        // burn buys keep their ETH on the curve — the pot backs the burned
        // tokens, which stay counted as sold and sit at the dead address
        assertEq(uint256(sold), FlockToken(t).balanceOf(pad.LP_BURN()));
        assertGe(address(pad).balance, uint256(realEth) + pad.creatorFees(alice));
    }

    function test_quote_matches_buy() public {
        address t = _create();
        uint256 q = pad.quoteBuy(t, 2 ether);
        vm.prank(bob);
        pad.buy{value: 2 ether}(t, q); // exact-quote as slippage min must pass
        assertEq(FlockToken(t).balanceOf(bob), q);
    }

    function test_slippage_protection() public {
        address t = _create();
        uint256 q = pad.quoteBuy(t, 1 ether);
        vm.prank(bob);
        vm.expectRevert(bytes("slippage"));
        pad.buy{value: 1 ether}(t, q + 1);
    }

    function test_curve_completes_and_graduates_with_refund() public {
        address t = _create();
        uint256 bobBefore = bob.balance;

        // Massive overshoot buy: should cap at 800M tokens, refund extra
        vm.prank(bob);
        pad.buy{value: 50 ether}(t, 0);

        assertEq(FlockToken(t).balanceOf(bob), 800_000_000 ether);

        // Curve math: eth needed = k/(vT-800M) - vE = 1.073e9/273e6 - 1 ~= 2.9304 ETH
        uint256 ethNeeded = 2_930_402_930_402_930_404; // wei, k/273M - 1e18 rounded up
        uint256 fee = ethNeeded / 100;
        uint256 spent = bobBefore - bob.balance;
        assertApproxEqAbs(spent, ethNeeded + fee, 10); // refund worked

        // Graduated: LP got pot + burn cut (curve was complete, so the burn
        // slice deepens liquidity instead) minus 0.05 graduation fee
        (,,,,, bool complete, bool graduated) = pad.curves(t);
        assertTrue(complete);
        assertTrue(graduated);
        assertEq(router.receivedTokens(), 200_000_000 ether);
        uint256 burnCut = (ethNeeded / 100) * 2000 / 10_000;
        assertApproxEqAbs(router.receivedEth(), ethNeeded + burnCut - 0.05 ether, 10);
        assertEq(router.lpRecipient(), pad.LP_BURN());

        // Launchpad holds exactly the creator's unclaimed fees, nothing else
        assertEq(address(pad).balance, pad.creatorFees(alice));
    }

    function test_no_trading_after_complete() public {
        address t = _create();
        vm.prank(bob);
        pad.buy{value: 50 ether}(t, 0);

        vm.prank(alice);
        vm.expectRevert(bytes("curve complete - trade on Uniswap"));
        pad.buy{value: 1 ether}(t, 0);
    }

    function test_creator_first_buy_in_create() public {
        vm.prank(alice);
        address t = pad.createToken{value: 0.5 ether}("Snipe Safe", "SAFE", "");
        assertGt(FlockToken(t).balanceOf(alice), 0);
    }

    function test_unknown_token_reverts() public {
        vm.prank(bob);
        vm.expectRevert(bytes("unknown token"));
        pad.buy{value: 1 ether}(address(0x1234), 0);
    }

    function test_direct_eth_rejected() public {
        vm.prank(bob);
        (bool ok, ) = address(pad).call{value: 1 ether}("");
        assertFalse(ok);
    }

    function test_multiple_tokens_isolated_accounting() public {
        address t1 = _create();
        vm.prank(bob);
        address t2 = pad.createToken("Two", "TWO", "");

        vm.prank(bob);
        pad.buy{value: 3 ether}(t1, 0);
        vm.prank(alice);
        pad.buy{value: 1 ether}(t2, 0);

        (,,, uint128 real1,,,) = pad.curves(t1);
        (,,, uint128 real2,,,) = pad.curves(t2);
        uint256 unclaimed = pad.creatorFees(alice) + pad.creatorFees(bob);
        assertEq(uint256(real1) + real2 + unclaimed, address(pad).balance);
    }

    function test_buyback_burn_reduces_supply_and_supports_price() public {
        address t = _create();
        vm.prank(bob);
        pad.buy{value: 1 ether}(t, 0);

        uint256 burned = FlockToken(t).balanceOf(pad.LP_BURN());
        assertGt(burned, 0);

        // sells also trigger a buyback: dead balance grows
        vm.startPrank(bob);
        uint256 bal = FlockToken(t).balanceOf(bob);
        FlockToken(t).approve(address(pad), bal / 2);
        pad.sell(t, bal / 2, 0);
        vm.stopPrank();
        assertGt(FlockToken(t).balanceOf(pad.LP_BURN()), burned);
    }

    /// Fuzz: for any buy size, contract balance always covers the curve
    /// pot PLUS unclaimed creator fees
    function testFuzz_solvency(uint96 amt) public {
        vm.assume(amt > 0.001 ether && amt < 50 ether);
        address t = _create();
        vm.prank(bob);
        pad.buy{value: amt}(t, 0);
        (,,, uint128 realEth,,, bool graduated) = pad.curves(t);
        if (!graduated) {
            assertGe(address(pad).balance, uint256(realEth) + pad.creatorFees(alice));
        }
    }

    function test_creator_fee_claim() public {
        address t = _create();
        vm.prank(bob);
        pad.buy{value: 1 ether}(t, 0);

        uint256 owed = pad.creatorFees(alice);
        assertEq(owed, 0.005 ether);

        uint256 before = alice.balance;
        vm.prank(alice);
        pad.claimCreatorFees();
        assertEq(alice.balance - before, owed);
        assertEq(pad.creatorFees(alice), 0);

        // can't double-claim
        vm.prank(alice);
        vm.expectRevert(bytes("nothing to claim"));
        pad.claimCreatorFees();
    }

    function test_creator_fees_survive_graduation() public {
        address t = _create();
        vm.prank(bob);
        pad.buy{value: 50 ether}(t, 0); // completes curve + graduates
        // creator still has claimable fees and contract can pay them
        uint256 owed = pad.creatorFees(alice);
        assertGt(owed, 0);
        assertGe(address(pad).balance, owed);
        vm.prank(alice);
        pad.claimCreatorFees();
        assertEq(pad.creatorFees(alice), 0);
    }
}
