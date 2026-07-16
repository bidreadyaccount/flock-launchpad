// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// ----------------------------------------------------------------------
/// FLOCK — a pump.fun-style token launchpad for Robinhood Chain (4663)
///
/// How it works, in plain terms:
///  1. Anyone calls createToken() to launch a new coin. 1,000,000,000
///     tokens are minted. 800,000,000 are sold on a bonding curve
///     (price starts tiny and rises as people buy). 200,000,000 are
///     held back for the Uniswap liquidity pool.
///  2. People buy/sell against the curve. The contract holds the ETH.
///  3. When all 800M curve tokens are sold ("hatched"), the token
///     GRADUATES: the collected ETH + the 200M reserved tokens are
///     deposited into Uniswap v2 and the LP tokens are burned, so the
///     liquidity is locked forever. From then on it trades on Uniswap.
///
/// Fees: a percentage (feeBps) of every buy and sell is split three ways:
///   - 50% to the coin's CREATOR (accrues, claimed via claimCreatorFees)
///   - burnBpsOfFee (e.g. 20%) is used to instantly BUY the coin back on
///     its own curve and send the tokens to the burn address — every
///     trade makes the coin scarcer
///   - the remainder goes to the platform treasury
/// Optionally a flat graduationFee is taken from the pot at graduation
/// (can be set to zero at deploy).
///
/// SECURITY NOTE: this contract holds real user money. Get a
/// professional audit before promoting it publicly.
/// ----------------------------------------------------------------------

interface IUniswapV2Router02 {
    function factory() external view returns (address);
    function WETH() external view returns (address);
    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external payable returns (uint amountToken, uint amountETH, uint liquidity);
}

interface IUniswapV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address);
}

/// Minimal, fixed-supply ERC-20. All supply is minted to the launchpad
/// at creation. No owner, no minting, no pausing, no tax — nothing a
/// rug pull could hide in.
contract FlockToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public immutable totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint256 _supply, address _to) {
        name = _name;
        symbol = _symbol;
        totalSupply = _supply;
        balanceOf[_to] = _supply;
        emit Transfer(address(0), _to, _supply);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        return _transfer(msg.sender, to, value);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= value, "allowance");
            allowance[from][msg.sender] = allowed - value;
        }
        return _transfer(from, to, value);
    }

    function _transfer(address from, address to, uint256 value) internal returns (bool) {
        require(to != address(0), "zero addr");
        uint256 bal = balanceOf[from];
        require(bal >= value, "balance");
        unchecked {
            balanceOf[from] = bal - value;
            balanceOf[to] += value;
        }
        emit Transfer(from, to, value);
        return true;
    }
}

contract FlockLaunchpad {
    // ------------------------------------------------------------------
    // Curve economics (fixed at deploy, same for every token)
    // ------------------------------------------------------------------
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether; // 1B tokens
    uint256 public constant CURVE_SUPPLY = 800_000_000 ether;   // sold on curve
    uint256 public constant LP_SUPPLY    = 200_000_000 ether;   // reserved for Uniswap

    /// Virtual reserves seed the constant-product curve (x*y=k) so the
    /// starting price isn't zero. With 1 ETH / 1.073B tokens virtual,
    /// selling out the 800M curve collects ~2.93 ETH and the final curve
    /// price matches the Uniswap listing price (2.93 ETH : 200M tokens),
    /// so graduation doesn't cause a price jump.
    uint256 public immutable virtualEth0;    // e.g. 1 ether
    uint256 public immutable virtualToken0;  // e.g. 1_073_000_000 ether

    uint256 public immutable feeBps;         // trade fee, e.g. 100 = 1%
    uint256 public immutable burnBpsOfFee;   // share of the fee burned, e.g. 2000 = 20%
    uint256 public immutable graduationFee;  // flat ETH fee at graduation
    address public immutable treasury;       // where fees go
    IUniswapV2Router02 public immutable router;

    address public constant LP_BURN = 0x000000000000000000000000000000000000dEaD;

    // ------------------------------------------------------------------
    // Per-token curve state
    // ------------------------------------------------------------------
    struct Curve {
        address creator;
        uint128 virtualEth;    // virtual ETH reserve
        uint128 virtualToken;  // virtual token reserve
        uint128 realEth;       // actual ETH held for this token
        uint128 tokensSold;    // curve tokens sold so far
        bool complete;         // curve sold out
        bool graduated;        // liquidity moved to Uniswap
    }

    mapping(address => Curve) public curves;
    address[] public allTokens;

    /// Accrued, claimable trade-fee earnings per creator (across all their coins)
    mapping(address => uint256) public creatorFees;

    bool private locked; // reentrancy guard

    // ------------------------------------------------------------------
    // Events (the website reads these to build the token list & charts)
    // ------------------------------------------------------------------
    event TokenCreated(
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        string metadataURI
    );
    event Trade(
        address indexed token,
        address indexed trader,
        bool isBuy,
        uint256 ethAmount,   // ETH in (buy) or out (sell), after fee
        uint256 tokenAmount,
        uint256 virtualEth,  // reserves AFTER the trade (for price charts)
        uint256 virtualToken
    );
    event Graduated(address indexed token, address pair, uint256 ethLiquidity, uint256 tokenLiquidity);
    event CreatorFeesClaimed(address indexed creator, uint256 amount);
    event BuybackBurn(address indexed token, uint256 ethAmount, uint256 tokenAmount);

    modifier nonReentrant() {
        require(!locked, "reentrancy");
        locked = true;
        _;
        locked = false;
    }

    constructor(
        address _router,
        address _treasury,
        uint256 _virtualEth0,
        uint256 _virtualToken0,
        uint256 _feeBps,
        uint256 _graduationFee,
        uint256 _burnBpsOfFee
    ) {
        require(_router != address(0) && _treasury != address(0), "zero addr");
        require(_feeBps <= 500, "fee too high"); // hard cap 5%
        require(_burnBpsOfFee <= 5000, "burn exceeds treasury share"); // creator gets 50%
        require(_virtualEth0 > 0 && _virtualToken0 > CURVE_SUPPLY, "bad curve params");
        router = IUniswapV2Router02(_router);
        treasury = _treasury;
        virtualEth0 = _virtualEth0;
        virtualToken0 = _virtualToken0;
        feeBps = _feeBps;
        graduationFee = _graduationFee;
        burnBpsOfFee = _burnBpsOfFee;
    }

    // ------------------------------------------------------------------
    // Create
    // ------------------------------------------------------------------

    /// Launch a new token. Optionally send ETH to make the first buy in
    /// the same transaction (snipe-protection for the creator).
    function createToken(
        string calldata name_,
        string calldata symbol_,
        string calldata metadataURI // image + description JSON, e.g. ipfs:// or https://
    ) external payable nonReentrant returns (address token) {
        require(bytes(name_).length > 0 && bytes(name_).length <= 64, "bad name");
        require(bytes(symbol_).length > 0 && bytes(symbol_).length <= 16, "bad symbol");

        token = address(new FlockToken(name_, symbol_, TOTAL_SUPPLY, address(this)));

        curves[token] = Curve({
            creator: msg.sender,
            virtualEth: uint128(virtualEth0),
            virtualToken: uint128(virtualToken0),
            realEth: 0,
            tokensSold: 0,
            complete: false,
            graduated: false
        });
        allTokens.push(token);

        emit TokenCreated(token, msg.sender, name_, symbol_, metadataURI);

        if (msg.value > 0) {
            _buy(token, msg.sender, msg.value, 0);
        }
    }

    // ------------------------------------------------------------------
    // Trade
    // ------------------------------------------------------------------

    /// Buy tokens with ETH. minTokensOut protects against being
    /// front-run (slippage). Any ETH that can't fit on the curve
    /// (because it sold out mid-buy) is refunded.
    function buy(address token, uint256 minTokensOut) external payable nonReentrant {
        require(msg.value > 0, "no eth");
        _buy(token, msg.sender, msg.value, minTokensOut);
    }

    function _buy(address token, address buyer, uint256 ethSent, uint256 minTokensOut) internal {
        Curve storage c = curves[token];
        require(c.creator != address(0), "unknown token");
        require(!c.complete, "curve complete - trade on Uniswap");

        uint256 fee = (ethSent * feeBps) / 10_000;
        uint256 ethIn = ethSent - fee;

        uint256 vE = c.virtualEth;
        uint256 vT = c.virtualToken;
        uint256 k = vE * vT;

        // Constant product: tokensOut = vT - k/(vE + ethIn)
        uint256 tokensOut = vT - _divUp(k, vE + ethIn);

        uint256 remaining = CURVE_SUPPLY - c.tokensSold;
        uint256 refund = 0;

        if (tokensOut >= remaining) {
            // Buy would clear the curve: only charge the ETH actually
            // needed for the remaining tokens, refund the rest.
            tokensOut = remaining;
            uint256 ethNeeded = _divUp(k, vT - tokensOut) - vE;
            // recompute the fee on the ETH actually used, refund the rest
            fee = (ethNeeded * feeBps) / 10_000;
            refund = ethSent - ethNeeded - fee;
            ethIn = ethNeeded;
            c.complete = true;
        }

        require(tokensOut >= minTokensOut && tokensOut > 0, "slippage");

        c.virtualEth = uint128(vE + ethIn);
        c.virtualToken = uint128(vT - tokensOut);
        c.realEth += uint128(ethIn);
        c.tokensSold += uint128(tokensOut);

        FlockToken(token).transfer(buyer, tokensOut);

        emit Trade(token, buyer, true, ethIn, tokensOut, c.virtualEth, c.virtualToken);

        _takeFee(token, fee, c.creator);
        if (refund > 0) _sendEth(buyer, refund);

        if (c.complete && !c.graduated) _graduate(token);
    }

    /// Sell tokens back to the curve for ETH (only before graduation).
    function sell(address token, uint256 tokenAmount, uint256 minEthOut) external nonReentrant {
        Curve storage c = curves[token];
        require(c.creator != address(0), "unknown token");
        require(!c.complete, "curve complete - trade on Uniswap");
        require(tokenAmount > 0, "no tokens");

        uint256 vE = c.virtualEth;
        uint256 vT = c.virtualToken;
        uint256 k = vE * vT;

        // ethOut = vE - k/(vT + tokenAmount)
        uint256 ethOut = vE - _divUp(k, vT + tokenAmount);
        require(ethOut <= c.realEth, "exceeds reserves");

        uint256 fee = (ethOut * feeBps) / 10_000;
        uint256 ethToUser = ethOut - fee;
        require(ethToUser >= minEthOut && ethToUser > 0, "slippage");

        c.virtualEth = uint128(vE - ethOut);
        c.virtualToken = uint128(vT + tokenAmount);
        c.realEth -= uint128(ethOut);
        c.tokensSold -= uint128(tokenAmount);

        // Pull tokens first (curve tokens go back into the pool)
        require(FlockToken(token).transferFrom(msg.sender, address(this), tokenAmount), "transfer failed");

        emit Trade(token, msg.sender, false, ethToUser, tokenAmount, c.virtualEth, c.virtualToken);

        _takeFee(token, fee, c.creator);
        _sendEth(msg.sender, ethToUser);

        // the buyback can complete the curve on the way down too
        if (c.complete && !c.graduated) _graduate(token);
    }

    // ------------------------------------------------------------------
    // Graduation
    // ------------------------------------------------------------------

    function _graduate(address token) internal {
        Curve storage c = curves[token];
        uint256 pot = c.realEth;
        uint256 gradFee = graduationFee < pot ? graduationFee : 0;
        uint256 ethForLp = pot - gradFee;

        c.realEth = 0;
        c.graduated = true;

        FlockToken(token).approve(address(router), LP_SUPPLY);
        (uint amountToken, uint amountETH, ) = router.addLiquidityETH{value: ethForLp}(
            token,
            LP_SUPPLY,
            0, // fresh pair; mins covered by amounts themselves
            0,
            LP_BURN, // LP tokens burned = liquidity locked forever
            block.timestamp
        );

        if (gradFee > 0) _sendEth(treasury, gradFee);

        address pair = IUniswapV2Factory(router.factory()).getPair(token, router.WETH());
        emit Graduated(token, pair, amountETH, amountToken);
    }

    /// Safety hatch: if graduation ever fails inside a buy (e.g. router
    /// hiccup), anyone can retry it later.
    function graduate(address token) external nonReentrant {
        Curve storage c = curves[token];
        require(c.complete && !c.graduated, "not ready");
        _graduate(token);
    }

    /// Split a trade fee three ways: half accrues to the coin's creator
    /// (pull-based so a broken creator wallet can never block trading),
    /// burnBpsOfFee buys the coin back and burns it, remainder to treasury.
    function _takeFee(address token, uint256 fee, address creator) internal {
        if (fee == 0) return;
        uint256 creatorCut = fee / 2;
        uint256 burnCut = (fee * burnBpsOfFee) / 10_000;
        creatorFees[creator] += creatorCut;
        if (burnCut > 0) _burnBuy(token, burnCut);
        uint256 treasuryCut = fee - creatorCut - burnCut;
        if (treasuryCut > 0) _sendEth(treasury, treasuryCut);
    }

    /// Buy `ethIn` worth of the coin on its own curve and burn the tokens.
    /// If the curve is already complete, the ETH is added to the pot instead
    /// (deepening the Uniswap liquidity — still goes to the community).
    function _burnBuy(address token, uint256 ethIn) internal {
        Curve storage c = curves[token];
        if (c.complete) {
            c.realEth += uint128(ethIn);
            return;
        }
        uint256 vE = c.virtualEth;
        uint256 vT = c.virtualToken;
        uint256 k = vE * vT;
        uint256 tokensOut = vT - _divUp(k, vE + ethIn);
        uint256 remaining = CURVE_SUPPLY - c.tokensSold;
        if (tokensOut >= remaining) {
            tokensOut = remaining;
            uint256 ethNeeded = _divUp(k, vT - tokensOut) - vE;
            // leftover ETH joins the pot as extra Uniswap liquidity
            uint256 leftover = ethIn - ethNeeded;
            c.complete = true;
            c.virtualEth = uint128(vE + ethNeeded);
            c.virtualToken = uint128(vT - tokensOut);
            c.realEth += uint128(ethNeeded + leftover);
            c.tokensSold += uint128(tokensOut);
        } else {
            c.virtualEth = uint128(vE + ethIn);
            c.virtualToken = uint128(vT - tokensOut);
            c.realEth += uint128(ethIn);
            c.tokensSold += uint128(tokensOut);
        }
        if (tokensOut > 0) {
            FlockToken(token).transfer(LP_BURN, tokensOut);
            emit Trade(token, LP_BURN, true, ethIn, tokensOut, c.virtualEth, c.virtualToken);
            emit BuybackBurn(token, ethIn, tokensOut);
        }
    }

    /// Creators call this to withdraw their accrued trade-fee earnings.
    function claimCreatorFees() external nonReentrant {
        uint256 amount = creatorFees[msg.sender];
        require(amount > 0, "nothing to claim");
        creatorFees[msg.sender] = 0;
        _sendEth(msg.sender, amount);
        emit CreatorFeesClaimed(msg.sender, amount);
    }

    // ------------------------------------------------------------------
    // Views (used by the website)
    // ------------------------------------------------------------------

    function tokenCount() external view returns (uint256) {
        return allTokens.length;
    }

    /// How many tokens you'd get right now for `ethIn` (after fee).
    function quoteBuy(address token, uint256 ethSent) external view returns (uint256) {
        Curve storage c = curves[token];
        if (c.complete) return 0;
        uint256 ethIn = ethSent - (ethSent * feeBps) / 10_000;
        uint256 k = uint256(c.virtualEth) * c.virtualToken;
        uint256 out = c.virtualToken - _divUp(k, c.virtualEth + ethIn);
        uint256 remaining = CURVE_SUPPLY - c.tokensSold;
        return out > remaining ? remaining : out;
    }

    /// How much ETH you'd get right now for selling `tokenAmount` (after fee).
    function quoteSell(address token, uint256 tokenAmount) external view returns (uint256) {
        Curve storage c = curves[token];
        if (c.complete) return 0;
        uint256 k = uint256(c.virtualEth) * c.virtualToken;
        uint256 ethOut = c.virtualEth - _divUp(k, c.virtualToken + tokenAmount);
        return ethOut - (ethOut * feeBps) / 10_000;
    }

    /// Progress toward graduation, in basis points (10000 = hatched).
    function hatchProgress(address token) external view returns (uint256) {
        Curve storage c = curves[token];
        return (uint256(c.tokensSold) * 10_000) / CURVE_SUPPLY;
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    function _divUp(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a + b - 1) / b;
    }

    function _sendEth(address to, uint256 amount) internal {
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "eth send failed");
    }

    receive() external payable {
        // Only the router should ever send ETH back (dust refunds at graduation)
        require(msg.sender == address(router), "direct eth not accepted");
    }
}
