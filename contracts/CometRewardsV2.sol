// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.15;

import "./CometInterface.sol";
import "./ERC20.sol";
import "./MerkleProof.sol";

/**
 * @title Compound's CometRewards Contract
 * @notice Hold and claim token rewards
 * @author Compound
 */

contract CometRewardsV2 {
    struct KeyVal {
        address key;
        uint256 val;
    }

    struct AssetConfig {
        uint256 multiplier;
        uint64 rescaleFactor;
        bool shouldUpscale;
    }

    struct Compaign {
        AssetConfig config;
        bytes32 startRoot;
        bytes32 finishRoot;
        mapping(address => uint256) claimed;
    }

    struct RewardOwed {
        address token;
        uint owed;
    }

    /// @notice The governor address which controls the contract
    address public governor;
    mapping(address => mapping(address => Compaign)) public compaigns;

    /// @dev The scale for factors
    uint256 internal constant FACTOR_SCALE = 1e18;

    /** Custom events **/

    event GovernorTransferred(
        address indexed oldGovernor,
        address indexed newGovernor
    );

    event RewardsClaimedSet(
        address indexed user,
        address indexed comet,
        uint256 amount
    );

    event RewardClaimed(
        address indexed src,
        address indexed recipient,
        address indexed token,
        uint256 amount
    );

    event ConfigUpdated(
        address indexed comet,
        address indexed token,
        uint256 multiplier
    );

    /** Custom errors **/

    error BadData();
    error InvalidUInt64(uint);
    error NotPermitted(address);
    error NotSupported(address, address);
    error TransferOutFailed(address, uint);
    error NullGovernor();
    error InvalidProof();

    /**
     * @notice Construct a new rewards pool
     * @param governor_ The governor who will control the contract
     */
    constructor(address governor_) {
        if (governor_ == address(0)) revert NullGovernor();
        governor = governor_;
    }

    function setRewardsConfigExt(
        address comet,
        bytes32 startRoot,
        KeyVal[] memory assets
    ) public {
        if (msg.sender != governor) revert NotPermitted(msg.sender);

        uint64 accrualScale = CometInterface(comet).baseAccrualScale();

        for (uint256 i = 0; i < assets.length; i++) {
            uint64 tokenScale = safe64(10 ** ERC20(assets[i].key).decimals());
            
            Compaign storage $ = compaigns[comet][assets[i].key];

            if ($.startRoot == bytes32(0)) {
                revert NotSupported(comet, assets[i].key);
            }

            $.startRoot = startRoot;

            AssetConfig memory config;

            emit ConfigUpdated(comet, assets[i].key, assets[i].val);

            if (accrualScale > tokenScale) {
                config = AssetConfig({
                    multiplier: assets[i].val,
                    rescaleFactor: 0,
                    shouldUpscale: false
                });
            } else {
                config = AssetConfig({
                    multiplier: assets[i].val,
                    rescaleFactor: 0,
                    shouldUpscale: true
                });
            }

            $.config = config;
        }
    }

    /**
     * @notice Set the reward token for a Comet instance
     * @param comet The protocol instance
     * @param tokens The reward tokens addresses
     */
    function setRewardsConfig(
        address comet,
        bytes32 startRoot,
        address[] calldata tokens
    ) external {
        KeyVal[] memory assets = new KeyVal[](tokens.length);
        for (uint i = 0; i < tokens.length; i++) {
            assets[i] = KeyVal({key: tokens[i], val: FACTOR_SCALE});
        }
        setRewardsConfigExt(comet, startRoot, assets);
    }

    /**
     * @notice Set the rewards claimed for a list of users
     * @param comet The protocol instance to populate the data for
     * @param users The list of users to populate the data for
     * @param claimedAmounts The list of claimed amounts to populate the data with
     */
    function setRewardsClaimed(
        address comet,
        address[] calldata users,
        KeyVal[] calldata claimedAmounts
    ) external {
        if (msg.sender != governor) revert NotPermitted(msg.sender);
        if (users.length != claimedAmounts.length) revert BadData();

        for (uint i = 0; i < users.length; i++) {
            emit RewardsClaimedSet(users[i], comet, claimedAmounts[i].val);
            compaigns[comet][claimedAmounts[i].key].claimed[
                users[i]
            ] = claimedAmounts[i].val;
        }
    }

    /**
     * @notice Withdraw tokens from the contract
     * @param token The reward token address
     * @param to Where to send the tokens
     * @param amount The number of tokens to withdraw
     */
    function withdrawToken(address token, address to, uint amount) external {
        if (msg.sender != governor) revert NotPermitted(msg.sender);

        doTransferOut(token, to, amount);
    }

    /**
     * @notice Transfers the governor rights to a new address
     * @param newGovernor The address of the new governor
     */
    function transferGovernor(address newGovernor) external {
        if (msg.sender != governor) revert NotPermitted(msg.sender);

        address oldGovernor = governor;
        governor = newGovernor;
        emit GovernorTransferred(oldGovernor, newGovernor);
    }

    /**
     * @notice Calculates the amount of a reward token owed to an account
     * @param comet The protocol instance
     * @param account The account to check rewards for
     */
    function getRewardOwed(
        address comet,
        address token,
        address account,
        uint startAccrued
    ) external returns (RewardOwed memory) {
        AssetConfig memory config = compaigns[comet][token].config;

        if (config.multiplier == 0) revert NotSupported(comet, token);

        CometInterface(comet).accrueAccount(account);

        uint claimed = compaigns[comet][token].claimed[account];
        uint accrued = getRewardAccrued(
            comet,
            account,
            token,
            startAccrued,
            config
        );

        uint owed = accrued > claimed ? accrued - claimed : 0;
        return RewardOwed(token, owed);
    }

    /**
     * @notice Claim rewards of token type from a comet instance to owner address
     * @param comet The protocol instance
     * @param src The owner to claim for
     * @param shouldAccrue Whether or not to call accrue first
     */
    function claim(
        address comet,
        address src,
        bool shouldAccrue,
        address token, //add array support
        uint startAccrued,
        bytes32[] calldata merkleProof
    ) external {
        claimInternal(comet, src, src, token, startAccrued, merkleProof, shouldAccrue);
    }

    /**
     * @notice Claim rewards of token type from a comet instance to a target address
     * @param comet The protocol instance
     * @param src The owner to claim for
     * @param to The address to receive the rewards
     */
    function claimTo(
        address comet,
        address src,
        address to,
        address token, //add array support
        uint startAccrued,
        bytes32[] calldata merkleProof
    ) external {
        if (!CometInterface(comet).hasPermission(src, msg.sender))
            revert NotPermitted(msg.sender);

        claimInternal(comet, src, to, token, startAccrued, merkleProof, true);
    }

    function claimInternal(
        address comet,
        address src,
        address to,
        address token, //add array support
        uint startAccrued,
        bytes32[] calldata merkleProof,
        bool shouldAccrue
    ) internal {
        
        Compaign storage $ = compaigns[comet][token];
        AssetConfig memory config = $.config;

        if (config.multiplier == 0) revert NotSupported(comet, token);

        bytes32 node = keccak256(abi.encodePacked(src, startAccrued));

        bool isValidProof = MerkleProof.verifyCalldata(
            merkleProof,
            $.startRoot,
            node
        );

        if (!isValidProof) revert InvalidProof();

        if (shouldAccrue) {
            CometInterface(comet).accrueAccount(src);
        }

        uint claimed = $.claimed[src];
        uint accrued = getRewardAccrued(
            comet,
            src,
            token,
            startAccrued,
            config
        );

        if (accrued > claimed) {
            uint owed = accrued - claimed;
            $.claimed[src] = accrued;
            doTransferOut(token, to, owed);

            emit RewardClaimed(src, to, token, owed);
        }
    }

    function getRewardAccrued(
        address comet,
        address account,
        address token,
        uint startAccrued, //if startAccrued = 0 => it new member
        AssetConfig memory config
    ) internal view returns (uint) {
        uint accrued = CometInterface(comet).baseTrackingAccrued(account) -
            startAccrued;

        if (config.shouldUpscale) {
            accrued *= config.rescaleFactor;
        } else {
            accrued /= config.rescaleFactor;
        }
        return (accrued * config.multiplier) / FACTOR_SCALE;
    }

    /**
     * @dev Safe ERC20 transfer out
     */
    function doTransferOut(address token, address to, uint amount) internal {
        bool success = ERC20(token).transfer(to, amount);
        if (!success) revert TransferOutFailed(to, amount);
    }

    /**
     * @dev Safe cast to uint64
     */
    function safe64(uint n) internal pure returns (uint64) {
        if (n > type(uint64).max) revert InvalidUInt64(n);
        return uint64(n);
    }
}
