// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.15;

import "./CometInterface.sol";
import "./CometRewardsInterface.sol";
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
        bytes32 startRoot;
        bytes32 finishRoot;
        address[] assets;
        mapping(address => AssetConfig) configs;
        mapping(address => uint256) claimed;
    }

    struct RewardOwed {
        address token;
        uint owed;
    }
    struct Proofs {
        uint startAccrued;
        uint finishAccrued;
        bytes32[] startMerkleProof;
        bytes32[] finishMerkleProof;
    }

    /// @notice The governor address which controls the contract
    address public governor;
    CometRewardsInterface public cometRewards;
    mapping(address => Compaign[]) public compaigns;

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
    constructor(address governor_, address cometRewards_) {
        if (governor_ == address(0)) revert NullGovernor();
        governor = governor_;
        cometRewards = CometRewardsInterface(cometRewards_);
    }

    function setCompaignsExt(
        address comet,
        bytes32 startRoot,
        KeyVal[] memory assets
    ) public {
        if (msg.sender != governor) revert NotPermitted(msg.sender);

        uint64 accrualScale = CometInterface(comet).baseAccrualScale();
        Compaign storage $ = compaigns[comet].push();
        $.startRoot = startRoot;
        for (uint256 i = 0; i < assets.length; i++) {
            uint64 tokenScale = safe64(10 ** ERC20(assets[i].key).decimals());

            emit ConfigUpdated(comet, assets[i].key, assets[i].val);

            if (accrualScale > tokenScale) {
                $.configs[assets[i].key] = AssetConfig({
                    multiplier: (assets[i].val * accrualScale) / tokenScale,
                    rescaleFactor: accrualScale / tokenScale,
                    shouldUpscale: false
                });
            } else {
                $.configs[assets[i].key] = AssetConfig({
                    multiplier: (assets[i].val * tokenScale) / accrualScale,
                    rescaleFactor: tokenScale / accrualScale,
                    shouldUpscale: true
                });
            }

            $.assets.push(assets[i].key);
        }
    }

    /**
     * @notice Set the reward token for a Comet instance
     * @param comet The protocol instance
     * @param tokens The reward tokens addresses
     */
    function setCompaign(
        address comet,
        bytes32 startRoot,
        address[] calldata tokens
    ) external {
        KeyVal[] memory assets = new KeyVal[](tokens.length);
        for (uint i = 0; i < tokens.length; i++) {
            assets[i] = KeyVal({key: tokens[i], val: FACTOR_SCALE});
        }
        setCompaignsExt(comet, startRoot, assets);
    }

    /**
     * @notice Set the rewards claimed for a list of users
     * @param comet The protocol instance to populate the data for
     * @param users The list of users to populate the data for
     * @param claimedAmounts The list of claimed amounts to populate the data with
     */
    function setRewardsClaimed(
        address comet,
        uint256 comapignId,
        address[] calldata users,
        KeyVal[] calldata claimedAmounts
    ) external {
        if (msg.sender != governor) revert NotPermitted(msg.sender);
        if (users.length != claimedAmounts.length) revert BadData();

        Compaign storage $ = compaigns[comet][comapignId];

        for (uint i = 0; i < users.length; i++) {
            emit RewardsClaimedSet(users[i], comet, claimedAmounts[i].val);
            $.claimed[users[i]] = claimedAmounts[i]
                .val;
        }
    }

    function setRewardsContract(address cometRewards_) external {
        if (msg.sender != governor) revert NotPermitted(msg.sender);
        cometRewards = CometRewardsInterface(cometRewards_);
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
        address account
    ) external returns (CometRewardsInterface.RewardOwed memory) {
        return cometRewards.getRewardOwed(comet, account);
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
        uint startAccrued,
        uint finishAccrued,
        uint comapignId
    ) external returns (RewardOwed memory) {
        Compaign storage $ = compaigns[comet][comapignId];
        AssetConfig memory config = $.configs[token];

        if (config.multiplier == 0) revert NotSupported(comet, token);

        CometInterface(comet).accrueAccount(account);

        uint claimed = $.claimed[account];
        uint accrued = getRewardAccrued(
            comet,
            account,
            startAccrued,
            finishAccrued,
            config
        );

        uint owed = accrued > claimed ? accrued - claimed : 0;
        return RewardOwed(token, owed);
    }

    /**
     * @notice Calculates the amount of a reward token owed to an account
     * @param comet The protocol instance
     * @param account The account to check rewards for
     */
    function getRewardOwedBatch(
        address comet,
        address token,
        address account,
        uint startAccrued,
        uint finishAccrued
    ) external returns (RewardOwed[] memory rewardsOwed) {
        rewardsOwed = new RewardOwed[](compaigns[comet].length);
        for (uint i; i < compaigns[comet].length; i++) {
            Compaign storage $ = compaigns[comet][i];
            AssetConfig memory config = $.configs[token];

            if (config.multiplier == 0) revert NotSupported(comet, token);

            CometInterface(comet).accrueAccount(account);

            uint claimed = $.claimed[account];
            uint accrued = getRewardAccrued(
                comet,
                account,
                startAccrued,
                finishAccrued,
                config
            );

            uint owed = accrued > claimed ? accrued - claimed : 0;
            rewardsOwed[i] = RewardOwed(token, owed);
        }
    }

    /**
     * @notice Claim rewards of token type from a comet instance to owner address
     * @param comet The protocol instance
     * @param src The owner to claim for
     * @param shouldAccrue Whether or not to call accrue first
     */
    function claim(address comet, address src, bool shouldAccrue) external {
        cometRewards.claim(comet, src, shouldAccrue);
    }

    /**
     * @notice Claim rewards of token type from a comet instance to a target address
     * @param comet The protocol instance
     * @param src The owner to claim for
     * @param to The address to receive the rewards
     */
    function claimTo(address comet, address src, address to, bool shouldAccrue) external {
        cometRewards.claimTo(comet, src, to, shouldAccrue);
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
        uint compaingId,
        Proofs calldata proofs
    ) external {
        claimInternal(comet, src, src, compaingId, proofs, shouldAccrue);
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
        uint compaingId,
        Proofs calldata proofs
    ) external {
        if (!CometInterface(comet).hasPermission(src, msg.sender))
            revert NotPermitted(msg.sender);

        claimInternal(comet, src, to, compaingId, proofs, true);
    }

    function claimInternal(
        address comet,
        address src,
        address to,
        uint compaingId, //add array support
        Proofs calldata proofs,
        bool shouldAccrue
    ) internal {
        Compaign storage $ = compaigns[comet][compaingId];

        if (proofs.startAccrued > 0) {
            bool isValidProof = MerkleProof.verifyCalldata(
                proofs.startMerkleProof,
                $.startRoot,
                keccak256(abi.encodePacked(src, proofs.startAccrued))
            );

            if (!isValidProof) revert InvalidProof();
        }

        if ($.finishRoot != "") {
            bool isValidProof2 = MerkleProof.verifyCalldata(
                proofs.finishMerkleProof,
                $.finishRoot,
                keccak256(abi.encodePacked(src, proofs.finishAccrued))
            );

            if (!isValidProof2) revert InvalidProof();
        }

        for (uint j; j < $.assets.length; j++) {
            address token = $.assets[j];
            AssetConfig memory config = $.configs[token];

            if (config.multiplier == 0) revert NotSupported(comet, token);

            if (shouldAccrue) {
                //remove from loop
                CometInterface(comet).accrueAccount(src);
            }

            uint claimed = $.claimed[src];
            uint accrued = getRewardAccrued(
                comet,
                src,
                proofs.startAccrued,
                proofs.finishAccrued,
                config
            );

            if (accrued > claimed) {
                uint owed = accrued - claimed;
                $.claimed[src] = accrued;
                doTransferOut(token, to, owed);

                emit RewardClaimed(src, to, token, owed);
            }
        }
    }

    function claimInternalExt(
        address comet,
        address src,
        address to,
        uint[] memory compaingIds, //add array support
        Proofs[] calldata proofs,
        bool shouldAccrue
    ) internal {
        if (compaingIds.length != proofs.length) revert BadData();
        for (uint i; i < compaingIds.length; i++) {
            claimInternal(
                comet,
                src,
                to,
                compaingIds[i],
                proofs[i],
                shouldAccrue
            );
        }
    }

    function getRewardAccrued(
        address comet,
        address account,
        uint startAccrued, //if startAccrued = 0 => it new member
        uint finishAccrued,
        AssetConfig memory config
    ) internal view returns (uint) {
        uint accrued;
        finishAccrued > 0 ? accrued = finishAccrued - startAccrued : accrued =
            CometInterface(comet).baseTrackingAccrued(account) -
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
