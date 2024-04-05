import { ethers } from 'hardhat';
import {
  defaultAssets,
  expect,
  exp,
  fastForward,
  makeProtocol,
  // makeRewards,
  makeRewardsV2,
  getProof,
  getRewardsOwed,
  // objectify,
  wait,
  event,
  // getBlock,
} from './helpers';

describe.only('CometRewardsV2', () => {
  describe('claim + supply', () => {
    it('can construct and claim rewards for owner with upscale', async () => {
      const {
        comet,
        governor,
        tokens: { USDC, COMP },
        users: [alice, bob],
      } = await makeProtocol({
        baseMinForRewards: 10e6,
      });
      const { rewardsV2, rewards, tree } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '100'], [bob.address, '200']]
      }
      );
      const configs = [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]];

      // allocate and approve transfers
      await COMP.allocateTo(rewards.address, exp(86500, 18));
      await USDC.allocateTo(alice.address, 10e6);
      await USDC.connect(alice).approve(comet.address, 10e6);

      // supply once
      await comet.connect(alice).supply(USDC.address, 10e6);

      await fastForward(86400);

      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
      const txn = await wait(await rewards.claim(comet.address, alice.address, true));
      expect(await COMP.balanceOf(alice.address)).to.be.equal(exp(86400, 18));

      // Note: First event is an ERC20 Transfer event
      expect(event(txn, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: COMP.address,
          amount: exp(86400, 18),
        },
      });

      await COMP.allocateTo(rewardsV2.address, exp(86500, 18));
      await USDC.allocateTo(rewardsV2.address, exp(86500, 6));

      const proof = await getProof(alice.address, tree);

      expect(await COMP.balanceOf(alice.address)).to.be.equal(exp(86400, 18));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(0);
      
      const txnV2 = await wait(rewardsV2.claim(
        comet.address,
        0,
        alice.address,
        true,
        {
          index: 1,
          startAccrued: 100,
          finishAccrued: 0,
          startMerkleProof: proof.proof,
          finishMerkleProof: []
        }
      ));
      const expectedRewards = await getRewardsOwed({
        comet: comet,
        tokens: [COMP, USDC],
        accountPrepared: {account: alice, startAccrued: 100},
        config: configs
      });


      expect(await COMP.balanceOf(alice.address)).to.be.equal(expectedRewards[0].add(exp(86400, 18)));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(expectedRewards[1]);

      // Note: First event is an ERC20 Transfer event
      expect(event(txnV2, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: COMP.address,
          amount: expectedRewards[0],
        },
      });
  
      expect(event(txnV2, 3)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: USDC.address,
          amount: expectedRewards[1],
        },
      });
    });

    it('can construct and claim rewards for owner with downscale', async () => {
      const {
        comet,
        governor,
        tokens: { USDC, COMP },
        users: [alice, bob],
      } = await makeProtocol({
        assets: defaultAssets(
          {},
          {
            COMP: { decimals: 5 },
          }
        ),
      });
      const { rewardsV2, rewards, tree } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '10'], [bob.address, '2']]
      }
      );
      const configs = [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]];

      // allocate and approve transfers
      await COMP.allocateTo(rewards.address, exp(86400, 5));
      await USDC.allocateTo(alice.address, 10e6);
      await USDC.connect(alice).approve(comet.address, 10e6);

      // supply once
      await comet.connect(alice).supply(USDC.address, 10e6);

      await fastForward(86400);

      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
      const txn = await wait(rewards.claim(comet.address, alice.address, true));
      expect(await COMP.balanceOf(alice.address)).to.be.equal(exp(86400, 5));

      // Note: First event is an ERC20 Transfer event
      expect(event(txn, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: COMP.address,
          amount: exp(86400, 5),
        },
      });

      await COMP.allocateTo(rewardsV2.address, exp(86500, 5));
      await USDC.allocateTo(rewardsV2.address, exp(86500, 6));

      const proof = await getProof(alice.address, tree);

      expect(await COMP.balanceOf(alice.address)).to.be.equal(exp(86400, 5));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(0);
      
      const txnV2 = await wait(rewardsV2.claim(
        comet.address,
        0,
        alice.address,
        true,
        {
          index: 1,
          startAccrued: 10,
          finishAccrued: 0,
          startMerkleProof: proof.proof,
          finishMerkleProof: []
        }
      ));

      const expectedRewards = await getRewardsOwed({
        comet: comet,
        tokens: [COMP, USDC],
        accountPrepared: {account: alice, startAccrued: 10},
        config: configs
      });

      expect(await COMP.balanceOf(alice.address)).to.be.deep.equal(expectedRewards[0].add(exp(86400, 5)));
      expect(await USDC.balanceOf(alice.address)).to.be.deep.equal(expectedRewards[1]);

      // Note: First event is an ERC20 Transfer event
      expect(event(txnV2, 1)).to.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: COMP.address,
          amount: expectedRewards[0],
        },
      });
      
      expect(event(txnV2, 3)).to.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: USDC.address,
          amount: expectedRewards[1],
        },
      });
    });

    it('can construct and claim rewards for owner with same scale', async () => {
      const {
        comet,
        governor,
        tokens: { USDC, COMP },
        users: [alice, bob],
      } = await makeProtocol({
        assets: defaultAssets(
          {},
          {
            COMP: { decimals: 6 },
          }
        ),
      });
      const { rewardsV2, rewards, tree } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '1000'], [bob.address, '1000']]
      }
      );
      const configs = [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]];

      // allocate and approve transfers
      await COMP.allocateTo(rewards.address, exp(86400, 6));
      await USDC.allocateTo(alice.address, 10e6);
      await USDC.connect(alice).approve(comet.address, 10e6);

      // supply once
      await comet.connect(alice).supply(USDC.address, 10e6);

      await fastForward(86400);

      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
      const txn = await wait(rewards.claim(comet.address, alice.address, true));
      expect(await COMP.balanceOf(alice.address)).to.be.equal(exp(86400, 6));

      // Note: First event is an ERC20 Transfer event
      expect(event(txn, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: COMP.address,
          amount: exp(86400, 6),
        },
      });

      await COMP.allocateTo(rewardsV2.address, exp(86500, 6));
      await USDC.allocateTo(rewardsV2.address, exp(86500, 6));

      const proof = await getProof(alice.address, tree);

      expect(await COMP.balanceOf(alice.address)).to.be.equal(exp(86400, 6));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(0);
      
      const txnV2 = await wait(rewardsV2.claim(
        comet.address,
        0,
        alice.address,
        true,
        {
          index: 1,
          startAccrued: 1000,
          finishAccrued: 0,
          startMerkleProof: proof.proof,
          finishMerkleProof: []
        }
      ));

      const expectedRewards = await getRewardsOwed({
        comet: comet,
        tokens: [COMP, USDC],
        accountPrepared: {account: alice, startAccrued: 1000},
        config: configs
      });

      expect(await COMP.balanceOf(alice.address)).to.be.deep.equal(expectedRewards[0].add(exp(86400, 6)));
      expect(await USDC.balanceOf(alice.address)).to.be.deep.equal(expectedRewards[1]);

      // Note: First event is an ERC20 Transfer event
      expect(event(txnV2, 1)).to.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: COMP.address,
          amount: expectedRewards[0],
        },
      });
      
      expect(event(txnV2, 3)).to.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: USDC.address,
          amount: expectedRewards[1],
        },
      });
    });

    it('does not overpay when claiming more than once', async () => {
      const {
        comet,
        governor,
        tokens: { USDC, COMP },
        users: [alice, bob],
      } = await makeProtocol({
        baseMinForRewards: 10e6,
      });
      const { rewardsV2, rewards, tree } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '1000'], [bob.address, '1000']]
      }
      );
      const configs = [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]];

      // allocate and approve transfers
      await COMP.allocateTo(rewards.address, exp(864000, 18));
      await USDC.allocateTo(alice.address, 10e6);
      await USDC.connect(alice).approve(comet.address, 10e6);

      // supply once
      await comet.connect(alice).supply(USDC.address, 10e6);

      await fastForward(86400);

      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
      const _tx0 = await wait(
        rewards.claim(comet.address, alice.address, true)
      );
      const _tx1 = await wait(
        rewards.claim(comet.address, alice.address, false)
      );
      expect(event(_tx0, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: COMP.address,
          amount: exp(86400, 18),
        },
      });
      expect(_tx1.receipt.logs).to.be.empty;
      expect(await COMP.balanceOf(alice.address)).to.be.equal(exp(86400, 18));

      await COMP.allocateTo(rewardsV2.address, exp(86500, 18));
      await USDC.allocateTo(rewardsV2.address, exp(86500, 6));

      const proof = await getProof(alice.address, tree);

      expect(await COMP.balanceOf(alice.address)).to.be.equal(exp(86400, 18));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(0);
      
      const txnV2 = await wait(rewardsV2.claim(
        comet.address,
        0,
        alice.address,
        true,
        {
          index: 1,
          startAccrued: 1000,
          finishAccrued: 0,
          startMerkleProof: proof.proof,
          finishMerkleProof: []
        }
      ));

      const expectedRewards = await getRewardsOwed({
        comet: comet,
        tokens: [COMP, USDC],
        accountPrepared: {account: alice, startAccrued: 1000},
        config: configs
      });

      const txnV2_2 = await wait(rewardsV2.claim(
        comet.address,
        0,
        alice.address,
        true,
        {
          index: 1,
          startAccrued: 1000,
          finishAccrued: 0,
          startMerkleProof: proof.proof,
          finishMerkleProof: []
        }
      ));

      const expectedRewards2 = await getRewardsOwed({
        comet: comet,
        tokens: [COMP, USDC],
        accountPrepared: {account: alice, startAccrued: 1000},
        config: configs,
        claimed: expectedRewards
      });

      expect(await COMP.balanceOf(alice.address)).to.be.deep.equal(expectedRewards[0].add(expectedRewards2[0]).add(exp(86400, 18)));
      expect(await USDC.balanceOf(alice.address)).to.be.deep.equal(expectedRewards[1].add(expectedRewards2[1]));
      
      // Note: First event is an ERC20 Transfer event
      expect(event(txnV2, 1)).to.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: COMP.address,
          amount: expectedRewards[0],
        },
      });
      
      expect(event(txnV2, 3)).to.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: USDC.address,
          amount: expectedRewards[1],
        },
      });
      
      expect(event(txnV2_2, 1)).to.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: COMP.address,
          amount: expectedRewards2[0],
        },
      });
      
      expect(event(txnV2_2, 3)).to.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: USDC.address,
          amount: expectedRewards2[1],
        },
      });
    });

    it('fails if comet instance is not configured', async () => {
      const {
        comet,
        governor,
        tokens: { USDC, COMP },
        users: [alice, bob],
      } = await makeProtocol({
        baseMinForRewards: 10e6,
      });

      const protocol2 = await makeProtocol({
        baseMinForRewards: 10e6,
      });

      const { rewardsV2, rewards, tree } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC]]],
        accountsPrepared: [[alice.address, '1'], [bob.address, '2']]
      });

      await expect(
        rewards.claim(protocol2.comet.address, alice.address, true)
      ).to.be.revertedWithCustomError(rewards, 'NotSupported').withArgs(protocol2.comet.address);
      
      const proof = await getProof(alice.address, tree);

      await expect(
        rewardsV2.claim(
          protocol2.comet.address,
          0,
          alice.address,
          true,
          {
            index: 1,
            startAccrued: 1000,
            finishAccrued: 0,
            startMerkleProof: proof.proof,
            finishMerkleProof: []
          }
        )
      ).to.be.revertedWithCustomError(rewardsV2, 'NotSupported').withArgs(protocol2.comet.address, ethers.constants.AddressZero);
    });

    it('fails if not enough rewards in the pool to transfer', async () => {
      const {
        comet,
        governor,
        tokens: { USDC, COMP },
        users: [alice, bob],
      } = await makeProtocol({
        baseMinForRewards: 10e6,
      });
      const { rewardsV2, rewards, tree } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '1000'], [bob.address, '1000']]
      }
      );

      // allocate and approve transfers
      await USDC.allocateTo(alice.address, 10e6);
      await USDC.connect(alice).approve(comet.address, 10e6);

      // supply once
      await comet.connect(alice).supply(USDC.address, 10e6);

      await expect(
        rewards.claim(comet.address, alice.address, true)
      ).to.be.revertedWith('ERC20: transfer amount exceeds balance');

      const proof = await getProof(alice.address, tree);
        
      await expect(rewardsV2.claim(
        comet.address,
        0,
        alice.address,
        true,
        {
          index: 1,
          startAccrued: 1000,
          finishAccrued: 0,
          startMerkleProof: proof.proof,
          finishMerkleProof: []
        }
      )).to.be.revertedWith('ERC20: transfer amount exceeds balance');
    });
  });
  describe('claimTo + borrow', () => {
    it('can construct and claim rewards to target with upscale', async () => {
      const {
        comet,
        governor,
        tokens: { USDC, COMP, WBTC },
        users: [alice, bob],
      } = await makeProtocol({
        baseMinForRewards: exp(10, 6),
        baseTrackingBorrowSpeed: exp(2, 15),
      });
      const { rewardsV2, rewards, tree } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '60'], [bob.address, '70']]
      }
      );
      const configs = [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]];

      // allocate and approve transfers
      await COMP.allocateTo(rewards.address, exp(86400 * 2, 18));
      await USDC.allocateTo(comet.address, exp(1e6, 6));
      await WBTC.allocateTo(alice.address, exp(1, 8));
      await WBTC.connect(alice).approve(comet.address, exp(1, 8));

      // allow manager, supply collateral, borrow
      await comet.connect(alice).allow(bob.address, true);
      await comet.connect(alice).supply(WBTC.address, exp(1, 8));
      await comet.connect(alice).withdraw(USDC.address, exp(10, 6));

      await fastForward(86400);

      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
      expect(await USDC.balanceOf(alice.address)).to.be.equal(10e6);
      expect(await comet.borrowBalanceOf(alice.address)).to.be.equal(10e6);
      const tx = await wait(
        rewards
          .connect(bob)
          .claimTo(comet.address, alice.address, bob.address, true)
      );
      expect(await COMP.balanceOf(bob.address)).to.be.equal(exp(86400 * 2, 18));

      // Note: First event is an ERC20 Transfer event
      expect(event(tx, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: bob.address,
          token: COMP.address,
          amount: exp(86400 * 2, 18),
        },
      });

      await COMP.allocateTo(rewardsV2.address, exp(86500 * 2, 18));
      await USDC.allocateTo(rewardsV2.address, exp(86500 * 2, 6));

      const proof = await getProof(alice.address, tree);

      expect(await COMP.balanceOf(bob.address)).to.be.equal(exp(86400 * 2, 18));
      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      
      const txnV2 = await wait(rewardsV2.connect(bob).claimTo(
        comet.address,
        0,
        alice.address,
        bob.address,
        true,
        {
          index: 1,
          startAccrued: 60,
          finishAccrued: 0,
          startMerkleProof: proof.proof,
          finishMerkleProof: []
        }
      ));
      const expectedRewards = await getRewardsOwed({
        comet: comet,
        tokens: [COMP, USDC],
        accountPrepared: {account: alice, startAccrued: 60},
        config: configs
      });


      expect(await COMP.balanceOf(bob.address)).to.be.equal(expectedRewards[0].add(exp(86400 * 2, 18)));
      expect(await USDC.balanceOf(bob.address)).to.be.equal(expectedRewards[1]);

      // Note: First event is an ERC20 Transfer event
      expect(event(txnV2, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: bob.address,
          token: COMP.address,
          amount: expectedRewards[0],
        },
      });
  
      expect(event(txnV2, 3)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: bob.address,
          token: USDC.address,
          amount: expectedRewards[1],
        },
      });
    });

    it('can construct and claim rewards to target with downscale', async () => {
      const {
        comet,
        governor,
        tokens: { USDC, COMP, WBTC },
        users: [alice, bob],
      } = await makeProtocol({
        assets: defaultAssets(
          {},
          {
            COMP: { decimals: 5 },
          }
        ),
        baseMinForRewards: exp(10, 5),
        baseTrackingBorrowSpeed: exp(2, 15),
      });
      const { rewardsV2, rewards, tree } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '60'], [bob.address, '70']]
      }
      );
      const configs = [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]];

      // allocate and approve transfers
      await COMP.allocateTo(rewards.address, exp(86400 * 2, 5));
      await USDC.allocateTo(comet.address, exp(1e6, 6));
      await WBTC.allocateTo(alice.address, exp(1, 8));
      await WBTC.connect(alice).approve(comet.address, exp(1, 8));

      // allow manager, supply collateral, borrow
      await comet.connect(alice).allow(bob.address, true);
      await comet.connect(alice).supply(WBTC.address, exp(1, 8));
      await comet.connect(alice).withdraw(USDC.address, exp(10, 6));

      await fastForward(86400);

      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
      expect(await USDC.balanceOf(alice.address)).to.be.equal(10e6);
      expect(await comet.borrowBalanceOf(alice.address)).to.be.equal(10e6);
      const _tx = await wait(
        rewards
          .connect(bob)
          .claimTo(comet.address, alice.address, bob.address, true)
      );
      expect(await COMP.balanceOf(bob.address)).to.be.equal(exp(86400 * 2, 5));

      expect(event(_tx, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: bob.address,
          token: COMP.address,
          amount: exp(86400 * 2, 5),
        },
      });

      await COMP.allocateTo(rewardsV2.address, exp(86500 * 2, 5));
      await USDC.allocateTo(rewardsV2.address, exp(86500 * 2, 6));

      const proof = await getProof(alice.address, tree);

      expect(await COMP.balanceOf(bob.address)).to.be.equal(exp(86400 * 2, 5));
      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      
      const txnV2 = await wait(rewardsV2.connect(bob).claimTo(
        comet.address,
        0,
        alice.address,
        bob.address,
        true,
        {
          index: 1,
          startAccrued: 60,
          finishAccrued: 0,
          startMerkleProof: proof.proof,
          finishMerkleProof: []
        }
      ));
      const expectedRewards = await getRewardsOwed({
        comet: comet,
        tokens: [COMP, USDC],
        accountPrepared: {account: alice, startAccrued: 60},
        config: configs
      });

      expect(await COMP.balanceOf(bob.address)).to.be.equal(expectedRewards[0].add(exp(86400 * 2, 5)));
      expect(await USDC.balanceOf(bob.address)).to.be.equal(expectedRewards[1]);

      // Note: First event is an ERC20 Transfer event
      expect(event(txnV2, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: bob.address,
          token: COMP.address,
          amount: expectedRewards[0],
        },
      });
  
      expect(event(txnV2, 3)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: bob.address,
          token: USDC.address,
          amount: expectedRewards[1],
        },
      });
    });

    it('can construct and claim rewards to target with same scale', async () => {
      const {
        comet,
        governor,
        tokens: { USDC, COMP, WBTC },
        users: [alice, bob],
      } = await makeProtocol({
        assets: defaultAssets(
          {},
          {
            COMP: { decimals: 6 },
          }
        ),
        baseMinForRewards: exp(10, 6),
        baseTrackingBorrowSpeed: exp(2, 15),
      });
      const { rewardsV2, rewards, tree } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '60'], [bob.address, '70']]
      }
      );
      const configs = [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]];

      // allocate and approve transfers
      await COMP.allocateTo(rewards.address, exp(86400 * 2, 6));
      await USDC.allocateTo(comet.address, exp(1e6, 6));
      await WBTC.allocateTo(alice.address, exp(1, 8));
      await WBTC.connect(alice).approve(comet.address, exp(1, 8));

      // allow manager, supply collateral, borrow
      await comet.connect(alice).allow(bob.address, true);
      await comet.connect(alice).supply(WBTC.address, exp(1, 8));
      await comet.connect(alice).withdraw(USDC.address, exp(10, 6));

      await fastForward(86400);

      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
      expect(await USDC.balanceOf(alice.address)).to.be.equal(10e6);
      expect(await comet.borrowBalanceOf(alice.address)).to.be.equal(10e6);
      const _tx = await wait(
        rewards
          .connect(bob)
          .claimTo(comet.address, alice.address, bob.address, true)
      );
      expect(await COMP.balanceOf(bob.address)).to.be.equal(exp(86400 * 2, 6));
        
      expect(event(_tx, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: bob.address,
          token: COMP.address,
          amount: exp(86400 * 2, 6),
        },
      });

      await COMP.allocateTo(rewardsV2.address, exp(86500 * 2, 6));
      await USDC.allocateTo(rewardsV2.address, exp(86500 * 2, 6));

      const proof = await getProof(alice.address, tree);

      expect(await COMP.balanceOf(bob.address)).to.be.equal(exp(86400 * 2, 6));
      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      
      const txnV2 = await wait(rewardsV2.connect(bob).claimTo(
        comet.address,
        0,
        alice.address,
        bob.address,
        true,
        {
          index: 1,
          startAccrued: 60,
          finishAccrued: 0,
          startMerkleProof: proof.proof,
          finishMerkleProof: []
        }
      ));
      const expectedRewards = await getRewardsOwed({
        comet: comet,
        tokens: [COMP, USDC],
        accountPrepared: {account: alice, startAccrued: 60},
        config: configs
      });

      expect(await COMP.balanceOf(bob.address)).to.be.equal(expectedRewards[0].add(exp(86400 * 2, 6)));
      expect(await USDC.balanceOf(bob.address)).to.be.equal(expectedRewards[1]);

      // Note: First event is an ERC20 Transfer event
      expect(event(txnV2, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: bob.address,
          token: COMP.address,
          amount: expectedRewards[0],
        },
      });
  
      expect(event(txnV2, 3)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: bob.address,
          token: USDC.address,
          amount: expectedRewards[1],
        },
      });
    });

    it('does not allow claiming more than once', async () => {
      const {
        comet,
        governor,
        tokens: { USDC, COMP, WBTC },
        users: [alice, bob],
      } = await makeProtocol({
        baseMinForRewards: exp(10, 6),
        baseTrackingBorrowSpeed: exp(2, 15),
      });
      const { rewardsV2, rewards, tree } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '60'], [bob.address, '70']]
      }
      );
      const configs = [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]];

      // allocate and approve transfers
      await COMP.allocateTo(rewards.address, exp(86400 * 2, 18));
      await USDC.allocateTo(comet.address, exp(1e6, 6));
      await WBTC.allocateTo(alice.address, exp(1, 8));
      await WBTC.connect(alice).approve(comet.address, exp(1, 8));

      // allow manager, supply collateral, borrow
      await comet.connect(alice).allow(bob.address, true);
      await comet.connect(alice).supply(WBTC.address, exp(1, 8));
      await comet.connect(alice).withdraw(USDC.address, exp(10, 6));

      await fastForward(86400);

      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
      expect(await USDC.balanceOf(alice.address)).to.be.equal(10e6);
      expect(await comet.borrowBalanceOf(alice.address)).to.be.equal(10e6);
      const _tx0 = await wait(
        rewards
          .connect(bob)
          .claimTo(comet.address, alice.address, bob.address, true)
      );
      const _tx1 = await wait(
        rewards
          .connect(bob)
          .claimTo(comet.address, alice.address, bob.address, false)
      );
      expect(await COMP.balanceOf(bob.address)).to.be.equal(exp(86400 * 2, 18));
        
      expect(event(_tx0, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: bob.address,
          token: COMP.address,
          amount: exp(86400 * 2, 18),
        },
      });

      expect(_tx1.receipt.logs).to.be.empty;
  
      await COMP.allocateTo(rewardsV2.address, exp(86500 * 2, 18));
      await USDC.allocateTo(rewardsV2.address, exp(86500 * 2, 6));

      const proof = await getProof(alice.address, tree);

      expect(await COMP.balanceOf(bob.address)).to.be.equal(exp(86400 * 2, 18));
      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      
      const txnV2 = await wait(rewardsV2.connect(bob).claimTo(
        comet.address,
        0,
        alice.address,
        bob.address,
        true,
        {
          index: 1,
          startAccrued: 60,
          finishAccrued: 0,
          startMerkleProof: proof.proof,
          finishMerkleProof: []
        }
      ));
      const expectedRewards = await getRewardsOwed({
        comet: comet,
        tokens: [COMP, USDC],
        accountPrepared: {account: alice, startAccrued: 60},
        config: configs
      });

      const txnV2_2 = await wait(rewardsV2.connect(bob).claimTo(
        comet.address,
        0,
        alice.address,
        bob.address,
        false,
        {
          index: 1,
          startAccrued: 60,
          finishAccrued: 0,
          startMerkleProof: proof.proof,
          finishMerkleProof: []
        }
      ));

      const expectedRewards2 = await getRewardsOwed({
        comet: comet,
        tokens: [COMP, USDC],
        accountPrepared: {account: alice, startAccrued: 60},
        config: configs,
        claimed: expectedRewards
      });
  
      expect(await COMP.balanceOf(bob.address)).to.be.deep.equal(expectedRewards[0].add(exp(86400 * 2, 18)));
      expect(await USDC.balanceOf(bob.address)).to.be.deep.equal(expectedRewards[1]);
    
      expect(expectedRewards2[0]).to.be.equal(0);
      expect(expectedRewards2[1]).to.be.equal(0);
      // Note: First event is an ERC20 Transfer event
      expect(event(txnV2, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: bob.address,
          token: COMP.address,
          amount: expectedRewards[0],
        },
      });
  
      expect(event(txnV2, 3)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: bob.address,
          token: USDC.address,
          amount: expectedRewards[1],
        },
      });

      expect(txnV2_2.receipt.logs).to.be.empty;
    });

    it('fails if comet instance is not configured', async () => {
      const {
        comet,
        governor,
        tokens: { USDC, COMP },
        users: [alice, bob],
      } = await makeProtocol({
        baseMinForRewards: 10e6,
      });
      const protocol2 = await makeProtocol({
        baseMinForRewards: 10e6,
      });
      const { rewardsV2, rewards, tree } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC]]],
        accountsPrepared: [[alice.address, '1'], [bob.address, '2']]
      });

      await comet.connect(alice).allow(bob.address, true);
      await protocol2.comet.connect(alice).allow(bob.address, true);
      await expect(
        rewards.connect(bob).claimTo(protocol2.comet.address, alice.address, bob.address, true)
      ).to.be.revertedWithCustomError(rewards, 'NotSupported').withArgs(protocol2.comet.address);
        
      const proof = await getProof(alice.address, tree);
  
      await expect(
        rewardsV2.connect(bob).claimTo(
          protocol2.comet.address,
          0,
          alice.address,
          bob.address,
          true,
          {
            index: 1,
            startAccrued: 1000,
            finishAccrued: 0,
            startMerkleProof: proof.proof,
            finishMerkleProof: []
          }
        )
      ).to.be.revertedWithCustomError(rewardsV2, 'NotSupported').withArgs(protocol2.comet.address, ethers.constants.AddressZero);
    });

    it('fails if not enough rewards in the pool to transfer', async () => {
      const {
        comet,
        governor,
        tokens: { USDC, COMP, WBTC },
        users: [alice, bob],
      } = await makeProtocol({
        baseMinForRewards: 10e6,
      });
      const { rewardsV2, rewards, tree } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '1000'], [bob.address, '1000']]
      }
      );

      // allocate and approve transfers
      await USDC.allocateTo(comet.address, exp(1e6, 6));
      await WBTC.allocateTo(alice.address, exp(1, 8));
      await WBTC.connect(alice).approve(comet.address, exp(1, 8));

      // allow manager, supply collateral, borrow
      await comet.connect(alice).allow(bob.address, true);
      await comet.connect(alice).supply(WBTC.address, exp(1, 8));
      await comet.connect(alice).withdraw(USDC.address, exp(10, 6));

      await expect(
        rewards
          .connect(bob)
          .claimTo(comet.address, alice.address, bob.address, true)
      ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
        
      const proof = await getProof(alice.address, tree);
        
      await expect(rewardsV2.connect(bob).claimTo(
        comet.address,
        0,
        alice.address,
        bob.address,
        true,
        {
          index: 1,
          startAccrued: 1000,
          finishAccrued: 0,
          startMerkleProof: proof.proof,
          finishMerkleProof: []
        }
      )).to.be.revertedWith('ERC20: transfer amount exceeds balance');
    });

    it('fails if caller is not permitted to claim rewards for owner', async () => {
      const {
        comet,
        governor,
        tokens: { COMP, USDC },
        users: [alice, bob],
      } = await makeProtocol({
        baseMinForRewards: exp(10, 6),
        baseTrackingBorrowSpeed: exp(2, 15),
      });
      const { rewardsV2, rewards, tree } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '1000'], [bob.address, '1000']]
      }
      );
      await expect(
        rewards.connect(bob).claimTo(comet.address, alice.address, bob.address, true)
      ).to.be.revertedWithCustomError(rewards, 'NotPermitted').withArgs(bob.address);

      const proof = await getProof(alice.address, tree);
        
      await expect(rewardsV2.connect(bob).claimTo(
        comet.address,
        0,
        alice.address,
        bob.address,
        true,
        {
          index: 1,
          startAccrued: 1000,
          finishAccrued: 0,
          startMerkleProof: proof.proof,
          finishMerkleProof: []
        }
      )).to.be.revertedWithCustomError(rewardsV2, 'NotPermitted').withArgs(bob.address);
    });
  });

  describe('getRewardOwed', () => {
    it('can construct and calculate rewards for owner with upscale', async () => {
      const {
        comet,
        governor,
        tokens: { USDC, COMP },
        users: [alice, bob],
      } = await makeProtocol({
        baseMinForRewards: 10e6,
      });
      const { rewardsV2, rewards } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '1000'], [bob.address, '1000']]
      }
      );

      // allocate and approve transfers
      await COMP.allocateTo(rewards.address, exp(86400, 18));
      await USDC.allocateTo(alice.address, 10e6);
      await USDC.connect(alice).approve(comet.address, 10e6);

      // supply once
      await comet.connect(alice).supply(USDC.address, 10e6);
      expect((await rewards.callStatic.getRewardOwed(comet.address, alice.address))[1]).to.equal(0);

      await fastForward(86400);
      await ethers.provider.send('evm_mine', []);

      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);

      const { token, owed } = await rewards.callStatic.getRewardOwed(
        comet.address,
        alice.address
      );

      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
      expect(token).to.be.equal(COMP.address);
      expect(owed).to.be.equal(exp(86400, 6));
      
      const result = await rewardsV2.callStatic.getRewardOwed(
        comet.address,
        0,
        COMP.address,
        alice.address,
        1000,
        0
      );
      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
      expect(result.token).to.be.equal(COMP.address);
      expect(result.owed).to.be.equal(ethers.BigNumber.from(exp(86400, 18)).sub(exp(1000, 12)));
    });

    it('can construct and calculate rewards for owner with downscale', async () => {
      const {
        comet,
        governor,
        tokens: { USDC, COMP },
        users: [alice, bob],
      } = await makeProtocol({
        assets: defaultAssets(
          {},
          {
            COMP: { decimals: 5 },
          }
        ),
      });
      const { rewardsV2, rewards } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '1000'], [bob.address, '1000']]
      }
      );

      // allocate and approve transfers
      await COMP.allocateTo(rewards.address, exp(86400, 5));
      await USDC.allocateTo(alice.address, 10e6);
      await USDC.connect(alice).approve(comet.address, 10e6);

      // supply once
      await comet.connect(alice).supply(USDC.address, 10e6);

      await fastForward(86400);
      await ethers.provider.send('evm_mine', []);

      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);

      const { token, owed } = await rewards.callStatic.getRewardOwed(
        comet.address,
        alice.address
      );

      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
      expect(token).to.be.equal(COMP.address);
      expect(owed).to.be.equal(exp(86400, 6));

      const result = await rewardsV2.callStatic.getRewardOwed(
        comet.address,
        0,
        COMP.address,
        alice.address,
        1000,
        0
      );
      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
      expect(result.token).to.be.equal(COMP.address);
      expect(result.owed).to.be.equal(ethers.BigNumber.from(exp(86400, 5)).sub((100)));
    });

    it('can construct and calculate rewards for owner with same scale', async () => {
      const {
        comet,
        governor,
        tokens: { USDC, COMP },
        users: [alice, bob],
      } = await makeProtocol({
        assets: defaultAssets(
          {},
          {
            COMP: { decimals: 6 },
          }
        ),
      });
      const { rewardsV2, rewards } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '1000'], [bob.address, '1000']]
      }
      );

      // allocate and approve transfers
      await COMP.allocateTo(rewards.address, exp(86400, 6));
      await USDC.allocateTo(alice.address, 10e6);
      await USDC.connect(alice).approve(comet.address, 10e6);

      // supply once
      await comet.connect(alice).supply(USDC.address, 10e6);

      await fastForward(86400);
      await ethers.provider.send('evm_mine', []);

      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);

      const { token, owed } = await rewards.callStatic.getRewardOwed(
        comet.address,
        alice.address
      );

      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
      expect(token).to.be.equal(COMP.address);
      expect(owed).to.be.equal(exp(86400, 6));

      const result = await rewardsV2.callStatic.getRewardOwed(
        comet.address,
        0,
        COMP.address,
        alice.address,
        1000,
        0
      );
      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
      expect(result.token).to.be.equal(COMP.address);
      expect(result.owed).to.be.equal(ethers.BigNumber.from(exp(86400, 6)).sub((1000)));
    });

    it('returns 0 owed if user already claimed', async () => {
      const {
        comet,
        governor,
        tokens: { USDC, COMP },
        users: [alice, bob],
      } = await makeProtocol({
        baseMinForRewards: 10e6,
      });
      const { rewardsV2, rewards } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '1000'], [bob.address, '1000']]
      }
      );

      // allocate and approve transfers
      await COMP.allocateTo(rewards.address, exp(864000, 18));
      await USDC.allocateTo(alice.address, 10e6);
      await USDC.connect(alice).approve(comet.address, 10e6);

      // supply once
      await comet.connect(alice).supply(USDC.address, 10e6);

      await fastForward(86400);

      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);

      const _tx0 = await wait(
        rewards.claim(comet.address, alice.address, true)
      );
      const { token, owed } = await rewards.callStatic.getRewardOwed(
        comet.address,
        alice.address
      );

      expect(await COMP.balanceOf(alice.address)).to.be.equal(exp(86400, 18));
      expect(token).to.be.equal(COMP.address);
      expect(owed).to.be.equal(0);

      const result = await rewardsV2.callStatic.getRewardOwed(
        comet.address,
        0,
        COMP.address,
        alice.address,
        1000,
        0
      );
      expect(result.token).to.be.equal(COMP.address);
      expect(result.owed).to.be.equal(ethers.BigNumber.from(exp(86400, 18)).sub(exp(1000, 12)));

    });

    it('fails if comet instance is not configured', async () => {
      const {
        comet,
        governor,
        tokens: { USDC, COMP },
        users: [alice, bob],
      } = await makeProtocol();
      const protocol2 = await makeProtocol();
      const { rewardsV2, rewards } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '1000'], [bob.address, '1000']]
      }
      );

      await expect(
        rewards.getRewardOwed(protocol2.comet.address, alice.address)
        //).to.be.revertedWith(`custom error 'NotSupported("${comet.address}")`);
      ).to.be.revertedWithCustomError(rewards, 'NotSupported').withArgs(protocol2.comet.address);
      await expect(
        rewardsV2.getRewardOwed(protocol2.comet.address, 0, COMP.address, alice.address, 1000, 0)
        //).to.be.revertedWith(`custom error 'NotSupported("${comet.address}")`);
      ).to.be.revertedWithCustomError(rewardsV2, 'NotSupported').withArgs(protocol2.comet.address, ethers.constants.AddressZero);
    });
  });

  describe('withdrawToken', () => {
    it('allows governor to withdraw funds added', async () => {
      const {
        comet,
        governor,
        tokens: { COMP, USDC },
        users: [alice, bob],
      } = await makeProtocol();
      const { rewardsV2, rewards } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '10'], [bob.address, '2']]
      }
      );

      // allocate
      await COMP.allocateTo(rewards.address, 2e6);
      await COMP.allocateTo(rewardsV2.address, 2e6);

      const _tx0 = await wait(
        rewards.withdrawToken(COMP.address, alice.address, 2e6)
      );
      const _tx1 = await wait(
        rewardsV2.withdrawToken(COMP.address, alice.address, 2e6)
      );
      expect(await COMP.balanceOf(alice.address)).to.be.equal(4e6);
      expect(_tx0.receipt.logs.length).to.be.equal(1);
      expect(_tx0.receipt.logs[0].topics[1]).to.be.equal(
        ethers.utils.hexZeroPad(rewards.address, 32).toLowerCase()
      );
      expect(_tx0.receipt.logs[0].topics[2]).to.be.equal(
        ethers.utils.hexZeroPad(alice.address, 32).toLowerCase()
      );
      expect(ethers.BigNumber.from(_tx0.receipt.logs[0].data)).to.be.equal(ethers.BigNumber.from(2e6));
    
      expect(_tx1.receipt.logs.length).to.be.equal(1);
      expect(_tx1.receipt.logs[0].topics[1]).to.be.equal(
        ethers.utils.hexZeroPad(rewardsV2.address, 32).toLowerCase()
      );
      expect(_tx1.receipt.logs[0].topics[2]).to.be.equal(
        ethers.utils.hexZeroPad(alice.address, 32).toLowerCase()
      );
      expect(ethers.BigNumber.from(_tx1.receipt.logs[0].data)).to.be.equal(ethers.BigNumber.from(2e6));
    });

    it('does not allow anyone but governor to withdraw', async () => {
      const {
        comet,
        governor,
        tokens: { COMP, USDC },
        users: [alice, bob],
      } = await makeProtocol();
      const { rewardsV2, rewards } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '10'], [bob.address, '2']]
      }
      );

      // allocate
      await COMP.allocateTo(rewards.address, 2e6);
      await COMP.allocateTo(rewardsV2.address, 2e6);

      await expect(
        rewards.connect(alice).withdrawToken(COMP.address, alice.address, 2e6)
        //).to.be.revertedWith(`custom error 'NotPermitted("${alice.address}")'`);
      ).to.be.revertedWith(`custom error 'NotPermitted(address)'`);
      await expect(
        rewardsV2.connect(alice).withdrawToken(COMP.address, alice.address, 2e6)
        //).to.be.revertedWith(`custom error 'NotPermitted("${alice.address}")'`);
      ).to.be.revertedWith(`custom error 'NotPermitted(address)'`);
    });
  });

  describe('setRewardsClaimed', () => {
    it('allows governor to set rewards claimed', async () => {
      const {
        comet,
        governor,
        tokens: { COMP, USDC },
        users: [alice, bob],
      } = await makeProtocol();
        
      const { rewardsV2, rewards } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '100'], [bob.address, '200']]
      }
      );

      const txn = await wait(
        rewards.setRewardsClaimed(
          comet.address,
          [alice.address, bob.address],
          [exp(1, 18), exp(2, 18)]
        )
      );
      const txn2 = await wait(
        rewardsV2.setRewardsClaimed(
          comet.address,
          0,
          [alice.address, bob.address],
          [
            [COMP.address, USDC.address],
            [COMP.address, USDC.address]
          ],
          [
            [exp(100, 18), exp(2, 18)],
            [exp(100, 18), exp(2, 18)]
          ]
        )
      );

      expect(
        await rewards.rewardsClaimed(comet.address, alice.address)
      ).to.be.equal(exp(1, 18));
      expect(
        await rewards.rewardsClaimed(comet.address, bob.address)
      ).to.be.equal(exp(2, 18));

      expect(
        await rewardsV2.rewardsClaimed(comet.address, 0, alice.address, COMP.address)
      ).to.be.equal(exp(100, 18));
      expect(
        await rewardsV2.rewardsClaimed(comet.address, 0, alice.address, USDC.address)
      ).to.be.equal(exp(2, 18));
      expect(
        await rewardsV2.rewardsClaimed(comet.address, 0, bob.address, COMP.address)
      ).to.be.equal(exp(100, 18));
      expect(
        await rewardsV2.rewardsClaimed(comet.address, 0, bob.address, USDC.address)
      ).to.be.equal(exp(2, 18));
      // Check that reward owed still works as expected
      const aliceRewardOwed = await rewards.callStatic.getRewardOwed(
        comet.address,
        alice.address
      );
      const bobRewardOwed = await rewards.callStatic.getRewardOwed(
        comet.address,
        bob.address
      );
      await USDC.allocateTo(alice.address, 10e6);
      await USDC.connect(alice).approve(comet.address, 10e6);
      await comet.connect(alice).supply(USDC.address, 10e6);

      await USDC.allocateTo(bob.address, 10e6);
      await USDC.connect(bob).approve(comet.address, 10e6);
      await comet.connect(bob).supply(USDC.address, 10e6);
  
      const aliceRewardOwedV2COMP = await rewardsV2.callStatic.getRewardOwed(
        comet.address,
        0,
        COMP.address,
        alice.address,
        100,
        0
      );
      const aliceRewardOwedV2USDC = await rewardsV2.callStatic.getRewardOwed(
        comet.address,
        0,
        USDC.address,
        alice.address,
        100,
        0
      );
      const bobRewardOwed2COMP = await rewardsV2.callStatic.getRewardOwed(
        comet.address,
        0,
        COMP.address,
        alice.address,
        200,
        0
      );
      const bobRewardOwed2USDC = await rewardsV2.callStatic.getRewardOwed(
        comet.address,
        0,
        USDC.address,
        alice.address,
        200,
        0
      );
      expect(aliceRewardOwed.owed).to.be.equal(0);
      expect(bobRewardOwed.owed).to.be.equal(0);
      expect(aliceRewardOwedV2COMP.owed).to.be.equal(0);
      expect(aliceRewardOwedV2USDC.owed).to.be.equal(0);
      expect(bobRewardOwed2COMP.owed).to.be.equal(0);
      expect(bobRewardOwed2USDC.owed).to.be.equal(0);

      expect(event(txn, 0)).to.be.deep.equal({
        RewardsClaimedSet: {
          user: alice.address,
          comet: comet.address,
          amount: exp(1, 18),
        },
      });
      expect(event(txn, 1)).to.be.deep.equal({
        RewardsClaimedSet: {
          user: bob.address,
          comet: comet.address,
          amount: exp(2, 18),
        },
      });
      expect(event(txn2, 0)).to.be.deep.equal({
        RewardsClaimedSet: {
          user: alice.address,
          comet: comet.address,
          token: COMP.address,
          amount: exp(100, 18),
        },
      });
      expect(event(txn2, 1)).to.be.deep.equal({
        RewardsClaimedSet: {
          user: alice.address,
          comet: comet.address,
          token: USDC.address,
          amount: exp(2, 18),
        },
      });
      expect(event(txn2, 2)).to.be.deep.equal({
        RewardsClaimedSet: {
          user: bob.address,
          comet: comet.address,
          token: COMP.address,
          amount: exp(100, 18),
        },
      });
      expect(event(txn2, 3)).to.be.deep.equal({
        RewardsClaimedSet: {
          user: bob.address,
          comet: comet.address,
          token: USDC.address,
          amount: exp(2, 18),
        },
      });
    });

    it('can be used to zero out retroactive rewards for users', async () => {
      const {
        comet,
        governor,
        tokens: { COMP, USDC },
        users: [alice, bob],
      } = await makeProtocol({
        baseMinForRewards: 10e6,
      });
      const { rewardsV2, rewards, tree } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '100'], [bob.address, '200']]
      }
      );

      // Get Alice into a state where she is owed 86400e18 rewards
      await COMP.allocateTo(rewards.address, exp(86400, 18));
      await COMP.allocateTo(rewardsV2.address, exp(86500, 18));
      await USDC.allocateTo(rewardsV2.address, exp(86500, 6));
      await USDC.allocateTo(alice.address, 10e6);
      await USDC.connect(alice).approve(comet.address, 10e6);
      await comet.connect(alice).supply(USDC.address, 10e6);
      await fastForward(86400);
      await ethers.provider.send('evm_mine', []);
      const aliceRewardOwedBefore = await rewards.callStatic.getRewardOwed(
        comet.address,
        alice.address
      );

      const aliceRewardsOwedBeforeV2COMP = await rewardsV2.callStatic.getRewardOwed(
        comet.address,
        0,
        COMP.address,
        alice.address,
        100,
        0
      );

      const aliceRewardsOwedBeforeV2USDC = await rewardsV2.callStatic.getRewardOwed(
        comet.address,
        0,
        USDC.address,
        alice.address,
        100,
        0
      );
      
      expect(aliceRewardOwedBefore.owed).to.be.equal(exp(86400, 6));
      expect(
        await rewards.rewardsClaimed(comet.address, alice.address)
      ).to.be.equal(0);

      // Set rewards claimed for Alice to zero out the rewards owed
      // const timestampPreTxn = (await getBlock()).timestamp;
      const timestampPreTxn = (await ethers.provider.getBlock('latest')).timestamp;
      const _tx = await wait(
        rewards.setRewardsClaimed(
          comet.address,
          [alice.address],
          [exp(86400, 6)]
        )
      );
      const elapsed = (await ethers.provider.getBlock('latest')).timestamp - timestampPreTxn;

      // Check that rewards owed has been zeroed out
      const aliceRewardOwedAfter = await rewards.callStatic.getRewardOwed(
        comet.address,
        alice.address
      );
      const expectedRewardOwed = exp(elapsed, 6);
      expect(
        await rewards.rewardsClaimed(comet.address, alice.address)
      ).to.be.equal(exp(86400, 6));
      expect(aliceRewardOwedAfter.owed).to.be.equal(expectedRewardOwed);

      // Make sure that claiming doesn't transfer any retroactive rewards to Alice
      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);

      const _tx2 = await wait(
        rewards.claim(comet.address, alice.address, true)
      );
      const elapsedSinceSetRewardsClaimed =
            (await ethers.provider.getBlock('latest')).timestamp - timestampPreTxn;
      const expectedRewardClaimed = exp(elapsedSinceSetRewardsClaimed, 18);
      expect(await COMP.balanceOf(alice.address)).to.be.equal(
        expectedRewardClaimed
      );

      expect(aliceRewardsOwedBeforeV2COMP.owed).to.be.equal(ethers.BigNumber.from(exp(86400, 18)).sub(exp(100, 12)));
      expect(aliceRewardsOwedBeforeV2USDC.owed).to.be.equal(ethers.BigNumber.from(exp(86400, 6)).sub(100));

      expect(
        await rewardsV2.rewardsClaimed(comet.address,  0, alice.address, COMP.address)
      ).to.be.equal(0);

      expect(
        await rewardsV2.rewardsClaimed(comet.address,  0, alice.address, USDC.address)
      ).to.be.equal(0);

        
      const toSubCOMP = ethers.BigNumber.from(exp(86400, 18)).sub(exp(100, 12));
      const toSubUSDC = ethers.BigNumber.from(exp(86400, 6)).sub(100);
      const elapsedAfter = (await ethers.provider.getBlock('latest')).timestamp - timestampPreTxn;
      await wait(
        rewardsV2.setRewardsClaimed(
          comet.address,
          0,
          [alice.address],
          [
            [COMP.address, USDC.address],
          ],
          [
            [toSubCOMP, toSubUSDC],
          ]
        )
      );
        

      // Check that rewards owed has been zeroed out
      const aliceRewardsOwedAfterV2COMP = await rewardsV2.callStatic.getRewardOwed(
        comet.address,
        0,
        COMP.address,
        alice.address,
        100,
        0
      );
      const aliceRewardsOwedAfterV2USDC = await rewardsV2.callStatic.getRewardOwed(
        comet.address,
        0,
        USDC.address,
        alice.address,
        100,
        0
      );
        
      expect(
        await rewardsV2.rewardsClaimed(comet.address, 0, alice.address, COMP.address)
      ).to.be.equal(toSubCOMP);

      expect(
        await rewardsV2.rewardsClaimed(comet.address, 0, alice.address, USDC.address)
      ).to.be.equal(toSubUSDC);
        
      const elapsed2 = (await ethers.provider.getBlock('latest')).timestamp - timestampPreTxn;

      expect(aliceRewardsOwedAfterV2COMP.owed).to.be.equal((exp(elapsed2, 18)));
      expect(aliceRewardsOwedAfterV2USDC.owed).to.be.equal((exp(elapsed2, 6)));
        

      expect(await COMP.balanceOf(alice.address)).to.be.equal(exp(elapsedAfter, 18));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(0);

      const proof = await getProof(alice.address, tree);
      await wait(
        rewardsV2.claim(
          comet.address,
          0,
          alice.address,
          true,
          {
            index: 1,
            startAccrued: 100,
            finishAccrued: 0,
            startMerkleProof: proof.proof,
            finishMerkleProof: []
          }
        )
      );
      const elapsedSinceSetRewardsClaimed2 =
            (await ethers.provider.getBlock('latest')).timestamp - timestampPreTxn;
      const expectedRewardClaimed2COMP = ethers.BigNumber.from(exp(elapsedSinceSetRewardsClaimed2, 18));
      expect(await COMP.balanceOf(alice.address)).to.be.equal(
        expectedRewardClaimed2COMP.add(exp(elapsedAfter, 18))
      );
      const expectedRewardClaimed2USDC = ethers.BigNumber.from(exp(elapsedSinceSetRewardsClaimed2, 6));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(
        expectedRewardClaimed2USDC
      );
    });

    it('reverts if addresses and claimedAmounts have different lengths', async () => {
      const {
        comet,
        governor,
        tokens: { COMP, USDC },
        users: [alice, bob],
      } = await makeProtocol();
      const { rewardsV2, rewards } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '100'], [bob.address, '200']]
      }
      );
      await expect(
        rewards.setRewardsClaimed(comet.address, [alice.address], [])
      ).to.be.revertedWith(`custom error 'BadData()'`);
      await expect(
        rewardsV2.setRewardsClaimed(comet.address, 0, [alice.address], [[]], [[]])
      ).to.be.revertedWith(`custom error 'BadData()'`);
    });

    it('does not allow anyone but governor to set rewards claimed', async () => {
      const {
        comet,
        governor,
        tokens: { COMP, USDC },
        users: [alice, bob],
      } = await makeProtocol();
      const { rewardsV2, rewards } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '100'], [bob.address, '200']]
      }
      );

      await expect(
        rewards
          .connect(alice)
          .setRewardsClaimed(comet.address, [alice.address], [exp(100, 18)])
        //).to.be.revertedWith(`custom error 'NotPermitted("${alice.address}")'`);
      ).to.be.revertedWith(`custom error 'NotPermitted(address)'`);

      await expect(
        rewardsV2
          .connect(alice)
          .setRewardsClaimed(comet.address, 0, [alice.address], [[COMP.address]], [[exp(100, 18)]])
        //).to.be.revertedWith(`custom error 'NotPermitted("${alice.address}")'`);
      ).to.be.revertedWithCustomError(rewardsV2, 'NotPermitted').withArgs(alice.address);
    });
  });

  describe('transferGovernor', () => {
    it('allows governor to transfer governor', async () => {
      const {
        comet,
        governor,
        tokens: { COMP, USDC },
        users: [alice, bob],
      } = await makeProtocol();
      const { rewardsV2, rewards } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '100'], [bob.address, '200']]
      }
      );

      const txn = await wait(rewards.transferGovernor(alice.address));

      expect(await rewards.governor()).to.be.equal(alice.address);
      expect(event(txn, 0)).to.be.deep.equal({
        GovernorTransferred: {
          oldGovernor: governor.address,
          newGovernor: alice.address,
        },
      });

      const txn2 = await wait(rewardsV2.transferGovernor(alice.address));
      expect(await rewardsV2.governor()).to.be.equal(alice.address);
      expect(event(txn2, 0)).to.be.deep.equal({
        GovernorTransferred: {
          oldGovernor: governor.address,
          newGovernor: alice.address,
        },
      });
    });

    it('does not allow anyone but governor to transfer governor', async () => {
      const {
        comet,
        governor,
        tokens: { COMP, USDC },
        users: [alice, bob],
      } = await makeProtocol();
      const { rewardsV2, rewards } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '100'], [bob.address, '200']]
      }
      );

      await expect(
        rewards.connect(alice).transferGovernor(alice.address)
        //).to.be.revertedWith(`custom error 'NotPermitted("${alice.address}")'`);
      ).to.be.revertedWithCustomError(rewards, 'NotPermitted').withArgs(alice.address);

      await expect(
        rewardsV2.connect(alice).transferGovernor(alice.address)
        //).to.be.revertedWith(`custom error 'NotPermitted("${alice.address}")'`);
      ).to.be.revertedWithCustomError(rewardsV2, 'NotPermitted').withArgs(alice.address);
    });
  }); 

  describe('new users', () => {
    it('can construct and claim rewards with upscale for new user', async () => {
      const {
        comet,
        governor,
        tokens: { USDC, COMP },
        users: [alice, bob, charlie],
      } = await makeProtocol({
        baseMinForRewards: 10e6,
      });
      const { rewardsV2, rewards, tree } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '100'], [bob.address, '200']]
      }
      );

      // allocate and approve transfers
      await COMP.allocateTo(rewards.address, exp(86500, 18));
      await USDC.allocateTo(alice.address, 10e6);
      await USDC.connect(alice).approve(comet.address, 10e6);
      await comet.connect(alice).supply(USDC.address, 10e6);
      
      await USDC.allocateTo(charlie.address, 10e6);
      await USDC.connect(charlie).approve(comet.address, 10e6);
      await comet.connect(charlie).supply(USDC.address, 10e6);

      await fastForward(86400*2);
      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
      const txn = await wait(await rewards.claim(comet.address, alice.address, true));
      expect(await COMP.balanceOf(alice.address)).to.be.equal(exp(86403, 18));

      // Note: First event is an ERC20 Transfer event
      expect(event(txn, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: COMP.address,
          amount: exp(86403, 18),
        },
      });

      await COMP.allocateTo(rewardsV2.address, exp(86503, 18));
      await USDC.allocateTo(rewardsV2.address, exp(86500, 6));

      const proofAlice = await getProof(alice.address, tree);
      const proofBob = await getProof(bob.address, tree);

      const txnV2 = await wait(rewardsV2.connect(charlie).claimForNewMember(
        comet.address,
        0,
        charlie.address,
        true,
        [alice.address, bob.address],
        [{
          index: 1,
          startAccrued: 100,
          finishAccrued: 0,
          startMerkleProof: proofAlice.proof,
          finishMerkleProof: []
        },
        {
          index: 2,
          startAccrued: 200,
          finishAccrued: 0,
          startMerkleProof: proofBob.proof,
          finishMerkleProof: []
        }]
      ));

      expect(await COMP.balanceOf(charlie.address)).to.be.equal(exp(86401.5, 18));
      expect(await USDC.balanceOf(charlie.address)).to.be.equal(exp(86401.5, 6));

      expect(event(txnV2, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: charlie.address,
          recipient: charlie.address,
          token: COMP.address,
          amount: exp(86401.5, 18),
        },
      });
  
      expect(event(txnV2, 3)).to.be.deep.equal({
        RewardClaimed: {
          src: charlie.address,
          recipient: charlie.address,
          token: USDC.address,
          amount: exp(86401.5, 6),
        },
      });
    });

    it('can construct and claim rewards with downscale for new user', async () => {
      const {
        comet,
        governor,
        tokens: { USDC, COMP },
        users: [alice, bob, charlie],
      } = await makeProtocol({
        baseMinForRewards: 10e6,
      });
      const { rewardsV2, rewards, tree } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '100'], [bob.address, '200']]
      }
      );

      // allocate and approve transfers
      await COMP.allocateTo(rewards.address, exp(86500, 18));
      await USDC.allocateTo(alice.address, 10e6);
      await USDC.connect(alice).approve(comet.address, 10e6);
      await comet.connect(alice).supply(USDC.address, 10e6);
      
      await USDC.allocateTo(charlie.address, 10e6);
      await USDC.connect(charlie).approve(comet.address, 10e6);
      await comet.connect(charlie).supply(USDC.address, 10e6);

      await fastForward(86400*2);
      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
      const txn = await wait(await rewards.claim(comet.address, alice.address, true));
      expect(await COMP.balanceOf(alice.address)).to.be.equal(exp(86403, 18));

      // Note: First event is an ERC20 Transfer event
      expect(event(txn, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: COMP.address,
          amount: exp(86403, 18),
        },
      });

      await COMP.allocateTo(rewardsV2.address, exp(86503, 18));
      await USDC.allocateTo(rewardsV2.address, exp(86500, 6));

      const proofAlice = await getProof(alice.address, tree);
      const proofBob = await getProof(bob.address, tree);

      const txnV2 = await wait(rewardsV2.connect(charlie).claimForNewMember(
        comet.address,
        0,
        charlie.address,
        true,
        [alice.address, bob.address],
        [{
          index: 1,
          startAccrued: 100,
          finishAccrued: 0,
          startMerkleProof: proofAlice.proof,
          finishMerkleProof: []
        },
        {
          index: 2,
          startAccrued: 200,
          finishAccrued: 0,
          startMerkleProof: proofBob.proof,
          finishMerkleProof: []
        }]
      ));

      expect(await COMP.balanceOf(charlie.address)).to.be.equal(exp(86401.5, 18));
      expect(await USDC.balanceOf(charlie.address)).to.be.equal(exp(86401.5, 6));

      expect(event(txnV2, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: charlie.address,
          recipient: charlie.address,
          token: COMP.address,
          amount: exp(86401.5, 18),
        },
      });

      expect(event(txnV2, 3)).to.be.deep.equal({
        RewardClaimed: {
          src: charlie.address,
          recipient: charlie.address,
          token: USDC.address,
          amount: exp(86401.5, 6),
        },
      });
    });

    it('can construct and claim rewards with upscale for new user with small rescale factor', async () => {
      const {
        comet,
        governor,
        tokens: { USDC, COMP },
        users: [alice, bob, charlie],
      } = await makeProtocol({
        baseMinForRewards: 10e6,
      });
      const { rewardsV2, rewards, tree } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '100'], [bob.address, '200']]
      }
      );

      // allocate and approve transfers
      await COMP.allocateTo(rewards.address, exp(86500, 18));
      await USDC.allocateTo(alice.address, 10e6);
      await USDC.connect(alice).approve(comet.address, 10e6);
      await comet.connect(alice).supply(USDC.address, 10e6);
      
      await USDC.allocateTo(charlie.address, 10e6);
      await USDC.connect(charlie).approve(comet.address, 10e6);
      await comet.connect(charlie).supply(USDC.address, 10e6);

      await fastForward(86400*2);
      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
      const txn = await wait(await rewards.claim(comet.address, alice.address, true));
      expect(await COMP.balanceOf(alice.address)).to.be.equal(exp(86403, 18));

      // Note: First event is an ERC20 Transfer event
      expect(event(txn, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: COMP.address,
          amount: exp(86403, 18),
        },
      });

      await COMP.allocateTo(rewardsV2.address, exp(86503, 18));
      await USDC.allocateTo(rewardsV2.address, exp(86500, 6));

      const proofAlice = await getProof(alice.address, tree);
      const proofBob = await getProof(bob.address, tree);

      const txnV2 = await wait(rewardsV2.connect(charlie).claimForNewMember(
        comet.address,
        0,
        charlie.address,
        true,
        [alice.address, bob.address],
        [{
          index: 1,
          startAccrued: 100,
          finishAccrued: 0,
          startMerkleProof: proofAlice.proof,
          finishMerkleProof: []
        },
        {
          index: 2,
          startAccrued: 200,
          finishAccrued: 0,
          startMerkleProof: proofBob.proof,
          finishMerkleProof: []
        }]
      ));

      expect(await COMP.balanceOf(charlie.address)).to.be.equal(exp(86401.5, 18));
      expect(await USDC.balanceOf(charlie.address)).to.be.equal(exp(86401.5, 6));

      expect(event(txnV2, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: charlie.address,
          recipient: charlie.address,
          token: COMP.address,
          amount: exp(86401.5, 18),
        },
      });

      expect(event(txnV2, 3)).to.be.deep.equal({
        RewardClaimed: {
          src: charlie.address,
          recipient: charlie.address,
          token: USDC.address,
          amount: exp(86401.5, 6),
        },
      });    
    });
  
    it('can construct and claim rewards for new user to target with upscale', async () => {
      const {
        comet,
        governor,
        tokens: { USDC, COMP },
        users: [alice, bob, charlie, derek],
      } = await makeProtocol({
        baseMinForRewards: 10e6,
      });
      const { rewardsV2, rewards, tree } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '100'], [bob.address, '200']]
      }
      );

      // allocate and approve transfers
      await comet.connect(alice).allow(charlie.address, true);
      await comet.connect(charlie).allow(derek.address, true);

      await COMP.allocateTo(rewards.address, exp(86500, 18));
      await USDC.allocateTo(alice.address, 10e6);
      await USDC.connect(alice).approve(comet.address, 10e6);
      await comet.connect(alice).supply(USDC.address, 10e6);
      
      await USDC.allocateTo(charlie.address, 10e6);
      await USDC.connect(charlie).approve(comet.address, 10e6);
      await comet.connect(charlie).supply(USDC.address, 10e6);
      await fastForward(86400*2);
      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
      const txn = await wait(await rewards.connect(charlie).claimTo(
        comet.address,
        alice.address,
        charlie.address,
        true
      ));

      expect(await COMP.balanceOf(charlie.address)).to.be.equal(exp(86403, 18));

      // Note: First event is an ERC20 Transfer event

      expect(event(txn, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: charlie.address,
          token: COMP.address,
          amount: exp(86403, 18),
        },
      });

      await COMP.allocateTo(rewardsV2.address, exp(86503, 18));
      await USDC.allocateTo(rewardsV2.address, exp(86500, 6));

      const proofAlice = await getProof(alice.address, tree);
      const proofBob = await getProof(bob.address, tree);

      const txnV2 = await wait(rewardsV2.connect(derek).claimToForNewMember(
        comet.address,
        0,
        charlie.address,
        derek.address,
        true,
        [alice.address, bob.address],
        [{
          index: 1,
          startAccrued: 100,
          finishAccrued: 0,
          startMerkleProof: proofAlice.proof,
          finishMerkleProof: []
        },
        {
          index: 2,
          startAccrued: 200,
          finishAccrued: 0,
          startMerkleProof: proofBob.proof,
          finishMerkleProof: []
        }]
      ));

      expect(await COMP.balanceOf(derek.address)).to.be.equal(exp(86401.5, 18));
      expect(await USDC.balanceOf(derek.address)).to.be.equal(exp(86401.5, 6));

      expect(event(txnV2, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: charlie.address,
          recipient: derek.address,
          token: COMP.address,
          amount: exp(86401.5, 18),
        },
      });

      expect(event(txnV2, 3)).to.be.deep.equal({
        RewardClaimed: {
          src: charlie.address,
          recipient: derek.address,
          token: USDC.address,
          amount: exp(86401.5, 6),
        },
      });
    });

    it('can construct and claim rewards for new member to target with downscale', async () => {
      const {
        comet,
        governor,
        tokens: { USDC, COMP },
        users: [alice, bob, charlie, derek],
      } = await makeProtocol({
        baseMinForRewards: 10e6,
      });
      const { rewardsV2, rewards, tree } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [[comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]],
        accountsPrepared: [[alice.address, '100'], [bob.address, '200']]
      }
      );

      // allocate and approve transfers
      await comet.connect(alice).allow(charlie.address, true);
      await comet.connect(charlie).allow(derek.address, true);

      await COMP.allocateTo(rewards.address, exp(86500, 18));
      await USDC.allocateTo(alice.address, 10e6);
      await USDC.connect(alice).approve(comet.address, 10e6);
      await comet.connect(alice).supply(USDC.address, 10e6);
      
      await USDC.allocateTo(charlie.address, 10e6);
      await USDC.connect(charlie).approve(comet.address, 10e6);
      await comet.connect(charlie).supply(USDC.address, 10e6);
      await fastForward(86400*2);
      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
      const txn = await wait(await rewards.connect(charlie).claimTo(
        comet.address,
        alice.address,
        charlie.address,
        true
      ));

      expect(await COMP.balanceOf(charlie.address)).to.be.equal(exp(86403, 18));

      // Note: First event is an ERC20 Transfer event

      expect(event(txn, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: charlie.address,
          token: COMP.address,
          amount: exp(86403, 18),
        },
      });

      await COMP.allocateTo(rewardsV2.address, exp(86503, 18));
      await USDC.allocateTo(rewardsV2.address, exp(86500, 6));

      const proofAlice = await getProof(alice.address, tree);
      const proofBob = await getProof(bob.address, tree);

      const txnV2 = await wait(rewardsV2.connect(derek).claimToForNewMember(
        comet.address,
        0,
        charlie.address,
        derek.address,
        true,
        [alice.address, bob.address],
        [{
          index: 1,
          startAccrued: 100,
          finishAccrued: 0,
          startMerkleProof: proofAlice.proof,
          finishMerkleProof: []
        },
        {
          index: 2,
          startAccrued: 200,
          finishAccrued: 0,
          startMerkleProof: proofBob.proof,
          finishMerkleProof: []
        }]
      ));

      expect(await COMP.balanceOf(derek.address)).to.be.equal(exp(86401.5, 18));
      expect(await USDC.balanceOf(derek.address)).to.be.equal(exp(86401.5, 6));

      expect(event(txnV2, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: charlie.address,
          recipient: derek.address,
          token: COMP.address,
          amount: exp(86401.5, 18),
        },
      });

      expect(event(txnV2, 3)).to.be.deep.equal({
        RewardClaimed: {
          src: charlie.address,
          recipient: derek.address,
          token: USDC.address,
          amount: exp(86401.5, 6),
        },
      });
    });
  });

  describe('multiple compains', () => {
    it('can construct and claim rewards for multiple campaigns with upscale', async () => {
      const {
        comet,
        governor,
        tokens: { USDC, COMP },
        users: [alice, bob],
      } = await makeProtocol({
        baseMinForRewards: 10e6,
      });
      const { rewardsV2, rewards, tree } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [
          [comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]],
          [comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]
        ],
        accountsPrepared: [[alice.address, '100'], [bob.address, '200']]
      }
      );

      // allocate and approve transfers
      await COMP.allocateTo(rewards.address, exp(86500, 18));
      await USDC.allocateTo(alice.address, 10e6);
      await USDC.connect(alice).approve(comet.address, 10e6);
      await comet.connect(alice).supply(USDC.address, 10e6);
      
      await fastForward(86400);

      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
      const txn = await wait(await rewards.claim(comet.address, alice.address, true));

      expect(await COMP.balanceOf(alice.address)).to.be.equal(exp(86400, 18));

      // Note: First event is an ERC20 Transfer event
      expect(event(txn, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: COMP.address,
          amount: exp(86400, 18),
        },
      });

      await COMP.allocateTo(rewardsV2.address, exp(86500*2, 18));
      await USDC.allocateTo(rewardsV2.address, exp(86500*2, 6));

      const proofAlice = await getProof(alice.address, tree);
      const balanceBeforeCOMP = await COMP.balanceOf(alice.address);
      const balanceBeforeUSDC = await USDC.balanceOf(alice.address);
      const txnV2 = await wait(rewardsV2.claimBatch(
        comet.address,
        [0,1],
        alice.address,
        true,
        [{
          index: 1,
          startAccrued: 100,
          finishAccrued: 0,
          startMerkleProof: proofAlice.proof,
          finishMerkleProof: []
        },
        {
          index: 1,
          startAccrued: 100,
          finishAccrued: 0,
          startMerkleProof: proofAlice.proof,
          finishMerkleProof: []
        }]
      ));
      const amountCOMP = ethers.BigNumber.from(exp(86403, 18)).sub(exp(100, 12));
      const amountUSDC = ethers.BigNumber.from(exp(86403, 6)).sub(exp(100));
      expect(await COMP.balanceOf(alice.address)).to.be.equal(amountCOMP.mul(2).add(balanceBeforeCOMP));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(amountUSDC.mul(2).add(balanceBeforeUSDC));

      expect(event(txnV2, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: COMP.address,
          amount: amountCOMP,
        },
      });

      expect(event(txnV2, 3)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: USDC.address,
          amount: amountUSDC,
        },
      });

      expect(event(txnV2, 5)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: COMP.address,
          amount: amountCOMP,
        },
      });

      expect(event(txnV2, 7)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: USDC.address,
          amount: amountUSDC,
        },
      });
    });

    it('can construct and claim rewards for multiple campaigns with downscale', async () => {
      const {
        comet,
        governor,
        tokens: { USDC, COMP },
        users: [alice, bob],
      } = await makeProtocol({
        baseMinForRewards: 10e6,
      });
      const { rewardsV2, rewards, tree } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [
          [comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]],
          [comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]
        ],
        accountsPrepared: [[alice.address, '100'], [bob.address, '200']]
      }
      );

      // allocate and approve transfers
      await COMP.allocateTo(rewards.address, exp(86500, 18));
      await USDC.allocateTo(alice.address, 10e6);
      await USDC.connect(alice).approve(comet.address, 10e6);
      await comet.connect(alice).supply(USDC.address, 10e6);
      
      await fastForward(86400);

      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
      const txn = await wait(await rewards.claim(comet.address, alice.address, true));

      expect(await COMP.balanceOf(alice.address)).to.be.equal(exp(86400, 18));

      // Note: First event is an ERC20 Transfer event
      expect(event(txn, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: COMP.address,
          amount: exp(86400, 18),
        },
      });

      await COMP.allocateTo(rewardsV2.address, exp(86500*2, 18));
      await USDC.allocateTo(rewardsV2.address, exp(86500*2, 6));

      const proofAlice = await getProof(alice.address, tree);
      const balanceBeforeCOMP = await COMP.balanceOf(alice.address);
      const balanceBeforeUSDC = await USDC.balanceOf(alice.address);
      const txnV2 = await wait(rewardsV2.claimBatch(
        comet.address,
        [0,1],
        alice.address,
        true,
        [{
          index: 1,
          startAccrued: 100,
          finishAccrued: 0,
          startMerkleProof: proofAlice.proof,
          finishMerkleProof: []
        },
        {
          index: 1,
          startAccrued: 100,
          finishAccrued: 0,
          startMerkleProof: proofAlice.proof,
          finishMerkleProof: []
        }]
      ));

      const amountCOMP = ethers.BigNumber.from(exp(86403, 18)).sub(exp(100, 12));
      const amountUSDC = ethers.BigNumber.from(exp(86403, 6)).sub(exp(100));

      expect(await COMP.balanceOf(alice.address)).to.be.equal(amountCOMP.mul(2).add(balanceBeforeCOMP));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(amountUSDC.mul(2).add(balanceBeforeUSDC));

      expect(event(txnV2, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: COMP.address,
          amount: amountCOMP,
        },
      });

      expect(event(txnV2, 3)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: USDC.address,
          amount: amountUSDC,
        },
      });

      expect(event(txnV2, 5)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: COMP.address,
          amount: amountCOMP,
        },
      });

      expect(event(txnV2, 7)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: USDC.address,
          amount: amountUSDC,
        },
      });
    });

    it('can construct and claim rewards for multiple campaigns with upscale for new user', async () => {
      const {
        comet,
        governor,
        tokens: { USDC, COMP },
        users: [alice, bob, charlie],
      } = await makeProtocol({
        baseMinForRewards: 10e6,
      });
      const { rewardsV2, rewards, tree } = await makeRewardsV2({
        governor: governor,
        configs: [[comet, COMP]],
      },
      {
        governor: governor,
        configs: [
          [comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]],
          [comet, [COMP, USDC], [exp(1, 18), exp(1, 18)]]
        ],
        accountsPrepared: [[alice.address, '100'], [bob.address, '200']]
      }
      );

      // allocate and approve transfers
      await COMP.allocateTo(rewards.address, exp(86500, 18));
      await USDC.allocateTo(alice.address, 10e6);
      await USDC.connect(alice).approve(comet.address, 10e6);
      await comet.connect(alice).supply(USDC.address, 10e6);
      
      await USDC.allocateTo(charlie.address, 10e6);
      await USDC.connect(charlie).approve(comet.address, 10e6);
      await comet.connect(charlie).supply(USDC.address, 10e6);
      await fastForward(86400*2);
      expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
      const txn = await wait(await rewards.claim(comet.address, alice.address, true));

      expect(await COMP.balanceOf(alice.address)).to.be.equal(exp(86403, 18));

      // Note: First event is an ERC20 Transfer event

      expect(event(txn, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: alice.address,
          recipient: alice.address,
          token: COMP.address,
          amount: exp(86403, 18),
        },
      });

      await COMP.allocateTo(rewardsV2.address, exp(86500*2, 18));
      await USDC.allocateTo(rewardsV2.address, exp(86500*2, 6));

      const proofAlice = await getProof(alice.address, tree);
      const proofBob = await getProof(bob.address, tree);

      const txnV2 = await wait(rewardsV2.claimBatchForNewMember(
        comet.address,
        [0,1],
        charlie.address,
        true,
        [[alice.address, bob.address], [alice.address, bob.address]],
        [
          {
            proofs:[{
              index: 1,
              startAccrued: 100,
              finishAccrued: 0,
              startMerkleProof: proofAlice.proof,
              finishMerkleProof: []
            },
            {
              index: 2,
              startAccrued: 200,
              finishAccrued: 0,
              startMerkleProof: proofBob.proof,
              finishMerkleProof: []
            }]
          },
          {
            proofs:[{
              index: 1,
              startAccrued: 100,
              finishAccrued: 0,
              startMerkleProof: proofAlice.proof,
              finishMerkleProof: []
            },
            {
              index: 2,
              startAccrued: 200,
              finishAccrued: 0,
              startMerkleProof: proofBob.proof,
              finishMerkleProof: []
            }]
          }
        ]
      ));
      const amountCOMP = ethers.BigNumber.from(exp(86401.5, 18));
      const amountUSDC = ethers.BigNumber.from(exp(86401.5, 6));

      expect(await COMP.balanceOf(charlie.address)).to.be.equal(amountCOMP.mul(2));
      expect(await USDC.balanceOf(charlie.address)).to.be.equal(amountUSDC.mul(2));

      expect(event(txnV2, 1)).to.be.deep.equal({
        RewardClaimed: {
          src: charlie.address,
          recipient: charlie.address,
          token: COMP.address,
          amount: amountCOMP,
        },
      });

      expect(event(txnV2, 3)).to.be.deep.equal({
        RewardClaimed: {
          src: charlie.address,
          recipient: charlie.address,
          token: USDC.address,
          amount: amountUSDC,
        },
      });

      expect(event(txnV2, 5)).to.be.deep.equal({
        RewardClaimed: {
          src: charlie.address,
          recipient: charlie.address,
          token: COMP.address,
          amount: amountCOMP,
        },
      });

      expect(event(txnV2, 7)).to.be.deep.equal({
        RewardClaimed: {
          src: charlie.address,
          recipient: charlie.address,
          token: USDC.address,
          amount: amountUSDC,
        },
      });
    });


    
  });
});

// const TEST_CASES = [
//   { multiplier: 598314321.512341 },
//   { multiplier: 23141 },
//   { multiplier: 100 },
//   { multiplier: 5.79 },
//   { multiplier: 1.33333332 },
//   { multiplier: 0.98765 },
//   { multiplier: 0.55 },
//   { multiplier: 0.12345 },
//   { multiplier: 0.01 },
//   { multiplier: 0.0598 },
//   { multiplier: 0.00355 },
//   { multiplier: 0.000015 },
//   { multiplier: 0.00000888 },
// ];

// for (const { multiplier } of TEST_CASES) {
//   describe(`CometRewards with multiplier ${multiplier}`, () => {
//     const MULTIPLIER = multiplier;
//     const MULTIPLIER_FACTOR = exp(MULTIPLIER, 18);

//     describe('claim + supply', () => {
//       it('can construct and claim rewards for owner with upscale', async () => {
//         const {
//           comet,
//           governor,
//           tokens: { USDC, COMP },
//           users: [alice],
//         } = await makeProtocol({
//           assets: defaultAssets(
//             {},
//             {
//               COMP: { decimals: 18 },
//             }
//           ),
//           baseMinForRewards: 10e6,
//         });
//         const { rewards } = await makeRewards({
//           governor,
//           configs: [[comet, COMP, MULTIPLIER_FACTOR]],
//         });

//         // allocate and approve transfers
//         await COMP.allocateTo(rewards.address, exp(86400 * MULTIPLIER, 18));
//         await USDC.allocateTo(alice.address, 10e6);
//         await USDC.connect(alice).approve(comet.address, 10e6);

//         // supply once
//         await comet.connect(alice).supply(USDC.address, 10e6);

//         await fastForward(86400);

//         expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
//         const txn = await wait(
//           rewards.claim(comet.address, alice.address, true)
//         );
//         expect(await COMP.balanceOf(alice.address)).to.be.equal(
//           (exp(86400, 18) * MULTIPLIER_FACTOR) / factorScale
//         );

//         // Note: First event is an ERC20 Transfer event
//         expect(event(txn, 1)).to.be.deep.equal({
//           RewardClaimed: {
//             src: alice.address,
//             recipient: alice.address,
//             token: COMP.address,
//             amount: (exp(86400, 18) * MULTIPLIER_FACTOR) / factorScale,
//           },
//         });
//       });

//       it('can construct and claim rewards for owner with downscale', async () => {
//         const {
//           comet,
//           governor,
//           tokens: { USDC, COMP },
//           users: [alice],
//         } = await makeProtocol({
//           assets: defaultAssets(
//             {},
//             {
//               COMP: { decimals: 2 },
//             }
//           ),
//         });
//         const { rewards } = await makeRewards({
//           governor,
//           configs: [[comet, COMP, MULTIPLIER_FACTOR]],
//         });

//         // allocate and approve transfers
//         await COMP.allocateTo(rewards.address, exp(86400 * MULTIPLIER, 2));
//         await USDC.allocateTo(alice.address, 10e6);
//         await USDC.connect(alice).approve(comet.address, 10e6);

//         // supply once
//         await comet.connect(alice).supply(USDC.address, 10e6);

//         await fastForward(86400);

//         expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
//         const txn = await wait(
//           rewards.claim(comet.address, alice.address, true)
//         );
//         expect(await COMP.balanceOf(alice.address)).to.be.equal(
//           (exp(86400, 2) * MULTIPLIER_FACTOR) / factorScale
//         );

//         // Note: First event is an ERC20 Transfer event
//         expect(event(txn, 1)).to.be.deep.equal({
//           RewardClaimed: {
//             src: alice.address,
//             recipient: alice.address,
//             token: COMP.address,
//             amount: (exp(86400, 2) * MULTIPLIER_FACTOR) / factorScale,
//           },
//         });
//       });

//       it('can construct and claim rewards for owner with upscale with small rescale factor', async () => {
//         const {
//           comet,
//           governor,
//           tokens: { USDC, COMP },
//           users: [alice],
//         } = await makeProtocol({
//           assets: defaultAssets(
//             {},
//             {
//               COMP: { decimals: 7 },
//             }
//           ),
//         });
//         const { rewards } = await makeRewards({
//           governor,
//           configs: [[comet, COMP, MULTIPLIER_FACTOR]],
//         });

//         // allocate and approve transfers
//         await COMP.allocateTo(rewards.address, exp(86400 * MULTIPLIER, 7));
//         await USDC.allocateTo(alice.address, 10e6);
//         await USDC.connect(alice).approve(comet.address, 10e6);

//         // supply once
//         await comet.connect(alice).supply(USDC.address, 10e6);

//         await fastForward(86400);

//         expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
//         const txn = await wait(
//           rewards.claim(comet.address, alice.address, true)
//         );
//         expect(await COMP.balanceOf(alice.address)).to.be.equal(
//           (exp(86400, 7) * MULTIPLIER_FACTOR) / factorScale
//         );

//         // Note: First event is an ERC20 Transfer event
//         expect(event(txn, 1)).to.be.deep.equal({
//           RewardClaimed: {
//             src: alice.address,
//             recipient: alice.address,
//             token: COMP.address,
//             amount: (exp(86400, 7) * MULTIPLIER_FACTOR) / factorScale,
//           },
//         });
//       });

//       it('can construct and claim rewards for owner with downscale with small rescale factor', async () => {
//         const {
//           comet,
//           governor,
//           tokens: { USDC, COMP },
//           users: [alice],
//         } = await makeProtocol({
//           assets: defaultAssets(
//             {},
//             {
//               COMP: { decimals: 5 },
//             }
//           ),
//         });
//         const { rewards } = await makeRewards({
//           governor,
//           configs: [[comet, COMP, MULTIPLIER_FACTOR]],
//         });

//         // allocate and approve transfers
//         await COMP.allocateTo(rewards.address, exp(86400 * MULTIPLIER, 5));
//         await USDC.allocateTo(alice.address, 10e6);
//         await USDC.connect(alice).approve(comet.address, 10e6);

//         // supply once
//         await comet.connect(alice).supply(USDC.address, 10e6);

//         await fastForward(86400);

//         expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
//         const txn = await wait(
//           rewards.claim(comet.address, alice.address, true)
//         );
//         expect(await COMP.balanceOf(alice.address)).to.be.equal(
//           (exp(86400, 5) * MULTIPLIER_FACTOR) / factorScale
//         );

//         // Note: First event is an ERC20 Transfer event
//         expect(event(txn, 1)).to.be.deep.equal({
//           RewardClaimed: {
//             src: alice.address,
//             recipient: alice.address,
//             token: COMP.address,
//             amount: (exp(86400, 5) * MULTIPLIER_FACTOR) / factorScale,
//           },
//         });
//       });

//       it('can construct and claim rewards for owner with same scale', async () => {
//         const {
//           comet,
//           governor,
//           tokens: { USDC, COMP },
//           users: [alice],
//         } = await makeProtocol({
//           assets: defaultAssets(
//             {},
//             {
//               COMP: { decimals: 6 },
//             }
//           ),
//         });
//         const { rewards } = await makeRewards({
//           governor,
//           configs: [[comet, COMP, MULTIPLIER_FACTOR]],
//         });

//         // allocate and approve transfers
//         await COMP.allocateTo(rewards.address, exp(86400 * MULTIPLIER, 6));
//         await USDC.allocateTo(alice.address, 10e6);
//         await USDC.connect(alice).approve(comet.address, 10e6);

//         // supply once
//         await comet.connect(alice).supply(USDC.address, 10e6);

//         await fastForward(86400);

//         expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
//         const txn = await wait(
//           rewards.claim(comet.address, alice.address, true)
//         );
//         expect(await COMP.balanceOf(alice.address)).to.be.equal(
//           (exp(86400, 6) * MULTIPLIER_FACTOR) / factorScale
//         );

//         // Note: First event is an ERC20 Transfer event
//         expect(event(txn, 1)).to.be.deep.equal({
//           RewardClaimed: {
//             src: alice.address,
//             recipient: alice.address,
//             token: COMP.address,
//             amount: (exp(86400, 6) * MULTIPLIER_FACTOR) / factorScale,
//           },
//         });
//       });

//       it('does not overpay when claiming more than once', async () => {
//         const {
//           comet,
//           governor,
//           tokens: { USDC, COMP },
//           users: [alice],
//         } = await makeProtocol({
//           baseMinForRewards: 10e6,
//         });
//         const { rewards } = await makeRewards({
//           governor,
//           configs: [[comet, COMP, MULTIPLIER_FACTOR]],
//         });

//         // allocate and approve transfers
//         await COMP.allocateTo(rewards.address, exp(86400 * MULTIPLIER, 18));
//         await USDC.allocateTo(alice.address, 10e6);
//         await USDC.connect(alice).approve(comet.address, 10e6);

//         // supply once
//         await comet.connect(alice).supply(USDC.address, 10e6);

//         await fastForward(86400);

//         expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
//         const _tx0 = await wait(
//           rewards.claim(comet.address, alice.address, true)
//         );
//         const _tx1 = await wait(
//           rewards.claim(comet.address, alice.address, false)
//         );
//         expect(await COMP.balanceOf(alice.address)).to.be.equal(
//           (exp(86400, 18) * MULTIPLIER_FACTOR) / factorScale
//         );
//       });

//       it('fails if comet instance is already configured', async () => {
//         const {
//           comet,
//           governor,
//           tokens: { COMP },
//         } = await makeProtocol({
//           baseMinForRewards: 10e6,
//         });
//         const { rewards } = await makeRewards({
//           governor,
//           configs: [[comet, COMP, MULTIPLIER_FACTOR]],
//         });
//         await expect(
//           rewards.setRewardConfig(comet.address, COMP.address)
//           //).to.be.revertedWith(`custom error 'AlreadyConfigured("${comet.address}")`);
//         ).to.be.revertedWith(`custom error 'AlreadyConfigured(address)'`);
//       });

//       it('fails if comet instance is not configured', async () => {
//         const {
//           comet,
//           governor,
//           users: [alice],
//         } = await makeProtocol();
//         const { rewards } = await makeRewards({ governor, configs: [] });

//         await expect(
//           rewards.claim(comet.address, alice.address, true)
//           //).to.be.revertedWith(`custom error 'NotSupported("${comet.address}")`);
//         ).to.be.revertedWith(`custom error 'NotSupported(address)'`);
//       });

//       it('fails if not enough rewards in the pool to transfer', async () => {
//         const {
//           comet,
//           governor,
//           tokens: { USDC, COMP },
//           users: [alice],
//         } = await makeProtocol({
//           baseMinForRewards: 10e6,
//         });
//         const { rewards } = await makeRewards({
//           governor,
//           configs: [[comet, COMP, MULTIPLIER_FACTOR]],
//         });

//         // allocate and approve transfers
//         await USDC.allocateTo(alice.address, 10e6);
//         await USDC.connect(alice).approve(comet.address, 10e6);

//         // supply once
//         await comet.connect(alice).supply(USDC.address, 10e6);

//         await expect(
//           rewards.claim(comet.address, alice.address, true)
//         ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
//       });
//     });

//     describe('claimTo + borrow', () => {
//       it('can construct and claim rewards to target with upscale', async () => {
//         const {
//           comet,
//           governor,
//           tokens: { USDC, COMP, WBTC },
//           users: [alice, bob],
//         } = await makeProtocol({
//           baseMinForRewards: exp(10, 6),
//           baseTrackingBorrowSpeed: exp(2, 15),
//         });
//         const { rewards } = await makeRewards({
//           governor,
//           configs: [[comet, COMP, MULTIPLIER_FACTOR]],
//         });

//         // allocate and approve transfers
//         await COMP.allocateTo(rewards.address, exp(86400 * 2 * MULTIPLIER, 18));
//         await USDC.allocateTo(comet.address, exp(1e6, 6));
//         await WBTC.allocateTo(alice.address, exp(1, 8));
//         await WBTC.connect(alice).approve(comet.address, exp(1, 8));

//         // allow manager, supply collateral, borrow
//         await comet.connect(alice).allow(bob.address, true);
//         await comet.connect(alice).supply(WBTC.address, exp(1, 8));
//         await comet.connect(alice).withdraw(USDC.address, exp(10, 6));

//         await fastForward(86400);

//         expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
//         expect(await USDC.balanceOf(alice.address)).to.be.equal(10e6);
//         expect(await comet.borrowBalanceOf(alice.address)).to.be.equal(10e6);
//         const tx = await wait(
//           rewards
//             .connect(bob)
//             .claimTo(comet.address, alice.address, bob.address, true)
//         );
//         expect(await COMP.balanceOf(bob.address)).to.be.equal(
//           (exp(86400 * 2, 18) * MULTIPLIER_FACTOR) / factorScale
//         );

//         // Note: First event is an ERC20 Transfer event
//         expect(event(tx, 1)).to.be.deep.equal({
//           RewardClaimed: {
//             src: alice.address,
//             recipient: bob.address,
//             token: COMP.address,
//             amount: (exp(86400 * 2, 18) * MULTIPLIER_FACTOR) / factorScale,
//           },
//         });
//       });

//       it('can construct and claim rewards to target with downscale', async () => {
//         const {
//           comet,
//           governor,
//           tokens: { USDC, COMP, WBTC },
//           users: [alice, bob],
//         } = await makeProtocol({
//           assets: defaultAssets(
//             {},
//             {
//               COMP: { decimals: 5 },
//             }
//           ),
//           baseMinForRewards: exp(10, 5),
//           baseTrackingBorrowSpeed: exp(2, 15),
//         });
//         const { rewards } = await makeRewards({
//           governor,
//           configs: [[comet, COMP, MULTIPLIER_FACTOR]],
//         });

//         // allocate and approve transfers
//         await COMP.allocateTo(rewards.address, exp(86400 * 2 * MULTIPLIER, 5));
//         await USDC.allocateTo(comet.address, exp(1e6, 6));
//         await WBTC.allocateTo(alice.address, exp(1, 8));
//         await WBTC.connect(alice).approve(comet.address, exp(1, 8));

//         // allow manager, supply collateral, borrow
//         await comet.connect(alice).allow(bob.address, true);
//         await comet.connect(alice).supply(WBTC.address, exp(1, 8));
//         await comet.connect(alice).withdraw(USDC.address, exp(10, 6));

//         await fastForward(86400);

//         expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
//         expect(await USDC.balanceOf(alice.address)).to.be.equal(10e6);
//         expect(await comet.borrowBalanceOf(alice.address)).to.be.equal(10e6);
//         const _tx = await wait(
//           rewards
//             .connect(bob)
//             .claimTo(comet.address, alice.address, bob.address, true)
//         );
//         expect(await COMP.balanceOf(bob.address)).to.be.equal(
//           (exp(86400 * 2, 5) * MULTIPLIER_FACTOR) / factorScale
//         );
//       });

//       it('can construct and claim rewards to target with same scale', async () => {
//         const {
//           comet,
//           governor,
//           tokens: { USDC, COMP, WBTC },
//           users: [alice, bob],
//         } = await makeProtocol({
//           assets: defaultAssets(
//             {},
//             {
//               COMP: { decimals: 6 },
//             }
//           ),
//           baseMinForRewards: exp(10, 6),
//           baseTrackingBorrowSpeed: exp(2, 15),
//         });
//         const { rewards } = await makeRewards({
//           governor,
//           configs: [[comet, COMP, MULTIPLIER_FACTOR]],
//         });

//         // allocate and approve transfers
//         await COMP.allocateTo(rewards.address, exp(86400 * 2 * MULTIPLIER, 6));
//         await USDC.allocateTo(comet.address, exp(1e6, 6));
//         await WBTC.allocateTo(alice.address, exp(1, 8));
//         await WBTC.connect(alice).approve(comet.address, exp(1, 8));

//         // allow manager, supply collateral, borrow
//         await comet.connect(alice).allow(bob.address, true);
//         await comet.connect(alice).supply(WBTC.address, exp(1, 8));
//         await comet.connect(alice).withdraw(USDC.address, exp(10, 6));

//         await fastForward(86400);

//         expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
//         expect(await USDC.balanceOf(alice.address)).to.be.equal(10e6);
//         expect(await comet.borrowBalanceOf(alice.address)).to.be.equal(10e6);
//         const _tx = await wait(
//           rewards
//             .connect(bob)
//             .claimTo(comet.address, alice.address, bob.address, true)
//         );
//         expect(await COMP.balanceOf(bob.address)).to.be.equal(
//           (exp(86400 * 2, 6) * MULTIPLIER_FACTOR) / factorScale
//         );
//       });

//       it('does not allow claiming more than once', async () => {
//         const {
//           comet,
//           governor,
//           tokens: { USDC, COMP, WBTC },
//           users: [alice, bob],
//         } = await makeProtocol({
//           baseMinForRewards: exp(10, 6),
//           baseTrackingBorrowSpeed: exp(2, 15),
//         });
//         const { rewards } = await makeRewards({
//           governor,
//           configs: [[comet, COMP, MULTIPLIER_FACTOR]],
//         });

//         // allocate and approve transfers
//         await COMP.allocateTo(rewards.address, exp(86400 * 2 * MULTIPLIER, 18));
//         await USDC.allocateTo(comet.address, exp(1e6, 6));
//         await WBTC.allocateTo(alice.address, exp(1, 8));
//         await WBTC.connect(alice).approve(comet.address, exp(1, 8));

//         // allow manager, supply collateral, borrow
//         await comet.connect(alice).allow(bob.address, true);
//         await comet.connect(alice).supply(WBTC.address, exp(1, 8));
//         await comet.connect(alice).withdraw(USDC.address, exp(10, 6));

//         await fastForward(86400);

//         expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
//         expect(await USDC.balanceOf(alice.address)).to.be.equal(10e6);
//         expect(await comet.borrowBalanceOf(alice.address)).to.be.equal(10e6);
//         const _tx0 = await wait(
//           rewards
//             .connect(bob)
//             .claimTo(comet.address, alice.address, bob.address, true)
//         );
//         const _tx1 = await wait(
//           rewards
//             .connect(bob)
//             .claimTo(comet.address, alice.address, bob.address, false)
//         );
//         expect(await COMP.balanceOf(bob.address)).to.be.equal(
//           (exp(86400 * 2, 18) * MULTIPLIER_FACTOR) / factorScale
//         );
//       });

//       it('fails if comet instance is not configured', async () => {
//         const {
//           comet,
//           governor,
//           users: [alice, bob],
//         } = await makeProtocol();
//         const { rewards } = await makeRewards({ governor, configs: [] });

//         await comet.connect(alice).allow(bob.address, true);
//         await expect(
//           rewards.connect(bob).claim(comet.address, alice.address, true)
//           //).to.be.revertedWith(`custom error 'NotSupported("${comet.address}")`);
//         ).to.be.revertedWith(`custom error 'NotSupported(address)'`);
//       });

//       it('fails if not enough rewards in the pool to transfer', async () => {
//         const {
//           comet,
//           governor,
//           tokens: { USDC, COMP, WBTC },
//           users: [alice, bob],
//         } = await makeProtocol({
//           baseMinForRewards: 10e6,
//         });
//         const { rewards } = await makeRewards({
//           governor,
//           configs: [[comet, COMP, MULTIPLIER_FACTOR]],
//         });

//         // allocate and approve transfers
//         await USDC.allocateTo(comet.address, exp(1e6, 6));
//         await WBTC.allocateTo(alice.address, exp(1, 8));
//         await WBTC.connect(alice).approve(comet.address, exp(1, 8));

//         // allow manager, supply collateral, borrow
//         await comet.connect(alice).allow(bob.address, true);
//         await comet.connect(alice).supply(WBTC.address, exp(1, 8));
//         await comet.connect(alice).withdraw(USDC.address, exp(10, 6));

//         await expect(
//           rewards
//             .connect(bob)
//             .claimTo(comet.address, alice.address, bob.address, true)
//         ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
//       });

//       it('fails if caller is not permitted to claim rewards for owner', async () => {
//         const {
//           comet,
//           governor,
//           tokens: { COMP },
//           users: [alice],
//         } = await makeProtocol({
//           baseMinForRewards: exp(10, 6),
//           baseTrackingBorrowSpeed: exp(2, 15),
//         });
//         const { rewards } = await makeRewards({
//           governor,
//           configs: [[comet, COMP, MULTIPLIER_FACTOR]],
//         });
//         await expect(
//           rewards.claimTo(comet.address, alice.address, governor.address, true)
//           //).to.be.revertedWith(`custom error 'NotPermitted("${governor.address}")'`);
//         ).to.be.revertedWith(`custom error 'NotPermitted(address)'`);
//       });
//     });

//     describe('getRewardOwed', () => {
//       it('can construct and calculate rewards for owner with upscale', async () => {
//         const {
//           comet,
//           governor,
//           tokens: { USDC, COMP },
//           users: [alice],
//         } = await makeProtocol({
//           assets: defaultAssets(
//             {},
//             {
//               COMP: { decimals: 18 },
//             }
//           ),
//           baseMinForRewards: 10e6,
//         });
//         const { rewards } = await makeRewards({
//           governor,
//           configs: [[comet, COMP, MULTIPLIER_FACTOR]],
//         });

//         // allocate and approve transfers
//         await COMP.allocateTo(rewards.address, exp(86400 * MULTIPLIER, 18));
//         await USDC.allocateTo(alice.address, 10e6);
//         await USDC.connect(alice).approve(comet.address, 10e6);

//         // supply once
//         await comet.connect(alice).supply(USDC.address, 10e6);

//         await fastForward(86400);
//         await ethers.provider.send('evm_mine', []);

//         expect(await COMP.balanceOf(alice.address)).to.be.equal(0);

//         const { token, owed } = await rewards.callStatic.getRewardOwed(
//           comet.address,
//           alice.address
//         );

//         expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
//         expect(token).to.be.equal(COMP.address);
//         expect(owed).to.be.equal(
//           (exp(86400, 18) * MULTIPLIER_FACTOR) / factorScale
//         );
//       });

//       it('can construct and calculate rewards for owner with downscale', async () => {
//         const {
//           comet,
//           governor,
//           tokens: { USDC, COMP },
//           users: [alice],
//         } = await makeProtocol({
//           assets: defaultAssets(
//             {},
//             {
//               COMP: { decimals: 2 },
//             }
//           ),
//         });
//         const { rewards } = await makeRewards({
//           governor,
//           configs: [[comet, COMP, MULTIPLIER_FACTOR]],
//         });

//         // allocate and approve transfers
//         await COMP.allocateTo(rewards.address, exp(86400 * MULTIPLIER, 2));
//         await USDC.allocateTo(alice.address, 10e6);
//         await USDC.connect(alice).approve(comet.address, 10e6);

//         // supply once
//         await comet.connect(alice).supply(USDC.address, 10e6);

//         await fastForward(86400);
//         await ethers.provider.send('evm_mine', []);

//         expect(await COMP.balanceOf(alice.address)).to.be.equal(0);

//         const { token, owed } = await rewards.callStatic.getRewardOwed(
//           comet.address,
//           alice.address
//         );

//         expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
//         expect(token).to.be.equal(COMP.address);
//         expect(owed).to.be.equal(
//           (exp(86400, 2) * MULTIPLIER_FACTOR) / factorScale
//         );
//       });

//       it('can construct and calculate rewards for owner with upscale with small rescale factor', async () => {
//         const {
//           comet,
//           governor,
//           tokens: { USDC, COMP },
//           users: [alice],
//         } = await makeProtocol({
//           assets: defaultAssets(
//             {},
//             {
//               COMP: { decimals: 7 },
//             }
//           ),
//         });
//         const { rewards } = await makeRewards({
//           governor,
//           configs: [[comet, COMP, MULTIPLIER_FACTOR]],
//         });

//         // allocate and approve transfers
//         await COMP.allocateTo(rewards.address, exp(86400 * MULTIPLIER, 7));
//         await USDC.allocateTo(alice.address, 10e6);
//         await USDC.connect(alice).approve(comet.address, 10e6);

//         // supply once
//         await comet.connect(alice).supply(USDC.address, 10e6);

//         await fastForward(86400);
//         await ethers.provider.send('evm_mine', []);

//         expect(await COMP.balanceOf(alice.address)).to.be.equal(0);

//         const { token, owed } = await rewards.callStatic.getRewardOwed(
//           comet.address,
//           alice.address
//         );

//         expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
//         expect(token).to.be.equal(COMP.address);
//         expect(owed).to.be.equal(
//           (exp(86400, 7) * MULTIPLIER_FACTOR) / factorScale
//         );
//       });

//       it('can construct and calculate rewards for owner with downscale with small rescale factor', async () => {
//         const {
//           comet,
//           governor,
//           tokens: { USDC, COMP },
//           users: [alice],
//         } = await makeProtocol({
//           assets: defaultAssets(
//             {},
//             {
//               COMP: { decimals: 5 },
//             }
//           ),
//         });
//         const { rewards } = await makeRewards({
//           governor,
//           configs: [[comet, COMP, MULTIPLIER_FACTOR]],
//         });

//         // allocate and approve transfers
//         await COMP.allocateTo(rewards.address, exp(86400 * MULTIPLIER, 5));
//         await USDC.allocateTo(alice.address, 10e6);
//         await USDC.connect(alice).approve(comet.address, 10e6);

//         // supply once
//         await comet.connect(alice).supply(USDC.address, 10e6);

//         await fastForward(86400);
//         await ethers.provider.send('evm_mine', []);

//         expect(await COMP.balanceOf(alice.address)).to.be.equal(0);

//         const { token, owed } = await rewards.callStatic.getRewardOwed(
//           comet.address,
//           alice.address
//         );

//         expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
//         expect(token).to.be.equal(COMP.address);
//         expect(owed).to.be.equal(
//           (exp(86400, 5) * MULTIPLIER_FACTOR) / factorScale
//         );
//       });

//       it('can construct and calculate rewards for owner with same scale', async () => {
//         const {
//           comet,
//           governor,
//           tokens: { USDC, COMP },
//           users: [alice],
//         } = await makeProtocol({
//           assets: defaultAssets(
//             {},
//             {
//               COMP: { decimals: 6 },
//             }
//           ),
//         });
//         const { rewards } = await makeRewards({
//           governor,
//           configs: [[comet, COMP, MULTIPLIER_FACTOR]],
//         });

//         // allocate and approve transfers
//         await COMP.allocateTo(rewards.address, exp(86400 * MULTIPLIER, 6));
//         await USDC.allocateTo(alice.address, 10e6);
//         await USDC.connect(alice).approve(comet.address, 10e6);

//         // supply once
//         await comet.connect(alice).supply(USDC.address, 10e6);

//         await fastForward(86400);
//         await ethers.provider.send('evm_mine', []);

//         expect(await COMP.balanceOf(alice.address)).to.be.equal(0);

//         const { token, owed } = await rewards.callStatic.getRewardOwed(
//           comet.address,
//           alice.address
//         );

//         expect(await COMP.balanceOf(alice.address)).to.be.equal(0);
//         expect(token).to.be.equal(COMP.address);
//         expect(owed).to.be.equal(
//           (exp(86400, 6) * MULTIPLIER_FACTOR) / factorScale
//         );
//       });

//       it('returns 0 owed if user already claimed', async () => {
//         const {
//           comet,
//           governor,
//           tokens: { USDC, COMP },
//           users: [alice],
//         } = await makeProtocol({
//           baseMinForRewards: 10e6,
//         });
//         const { rewards } = await makeRewards({
//           governor,
//           configs: [[comet, COMP, MULTIPLIER_FACTOR]],
//         });

//         // allocate and approve transfers
//         await COMP.allocateTo(rewards.address, exp(86400 * MULTIPLIER, 18));
//         await USDC.allocateTo(alice.address, 10e6);
//         await USDC.connect(alice).approve(comet.address, 10e6);

//         // supply once
//         await comet.connect(alice).supply(USDC.address, 10e6);

//         await fastForward(86400);

//         expect(await COMP.balanceOf(alice.address)).to.be.equal(0);

//         const _tx0 = await wait(
//           rewards.claim(comet.address, alice.address, true)
//         );
//         const { token, owed } = await rewards.callStatic.getRewardOwed(
//           comet.address,
//           alice.address
//         );

//         expect(await COMP.balanceOf(alice.address)).to.be.equal(
//           (exp(86400, 18) * MULTIPLIER_FACTOR) / factorScale
//         );
//         expect(token).to.be.equal(COMP.address);
//         expect(owed).to.be.equal(0);
//       });

//       it('fails if comet instance is not configured', async () => {
//         const {
//           comet,
//           governor,
//           users: [alice],
//         } = await makeProtocol();
//         const { rewards } = await makeRewards({ governor, configs: [] });

//         await expect(
//           rewards.getRewardOwed(comet.address, alice.address)
//           //).to.be.revertedWith(`custom error 'NotSupported("${comet.address}")`);
//         ).to.be.revertedWith(`custom error 'NotSupported(address)'`);
//       });
//     });

//     describe('setRewardConfig', () => {
//       it('allows governor to set rewards token with upscale', async () => {
//         const {
//           comet,
//           governor,
//           tokens: { COMP },
//         } = await makeProtocol({
//           assets: defaultAssets(
//             {},
//             {
//               COMP: { decimals: 18 },
//             }
//           ),
//         });
//         const { rewards } = await makeRewards({
//           governor,
//           configs: [[comet, COMP, MULTIPLIER_FACTOR]],
//         });

//         expect(
//           objectify(await rewards.rewardConfig(comet.address))
//         ).to.be.deep.equal({
//           token: COMP.address,
//           rescaleFactor: exp(1, 12),
//           shouldUpscale: true,
//           multiplier: MULTIPLIER_FACTOR,
//         });
//       });

//       it('allows governor to set rewards token with downscale', async () => {
//         const {
//           comet,
//           governor,
//           tokens: { COMP },
//         } = await makeProtocol({
//           assets: defaultAssets(
//             {},
//             {
//               COMP: { decimals: 2 },
//             }
//           ),
//         });
//         const { rewards } = await makeRewards({
//           governor,
//           configs: [[comet, COMP, MULTIPLIER_FACTOR]],
//         });

//         expect(
//           objectify(await rewards.rewardConfig(comet.address))
//         ).to.be.deep.equal({
//           token: COMP.address,
//           rescaleFactor: exp(1, 4),
//           shouldUpscale: false,
//           multiplier: MULTIPLIER_FACTOR,
//         });
//       });

//       it('allows governor to set rewards token with upscale with small rescale factor', async () => {
//         const {
//           comet,
//           governor,
//           tokens: { COMP },
//         } = await makeProtocol({
//           assets: defaultAssets(
//             {},
//             {
//               COMP: { decimals: 7 },
//             }
//           ),
//         });
//         const { rewards } = await makeRewards({
//           governor,
//           configs: [[comet, COMP, MULTIPLIER_FACTOR]],
//         });

//         expect(
//           objectify(await rewards.rewardConfig(comet.address))
//         ).to.be.deep.equal({
//           token: COMP.address,
//           rescaleFactor: 10n,
//           shouldUpscale: true,
//           multiplier: MULTIPLIER_FACTOR,
//         });
//       });

//       it('allows governor to set rewards token with downscale with small rescale factor', async () => {
//         const {
//           comet,
//           governor,
//           tokens: { COMP },
//         } = await makeProtocol({
//           assets: defaultAssets(
//             {},
//             {
//               COMP: { decimals: 5 },
//             }
//           ),
//         });
//         const { rewards } = await makeRewards({
//           governor,
//           configs: [[comet, COMP, MULTIPLIER_FACTOR]],
//         });

//         expect(
//           objectify(await rewards.rewardConfig(comet.address))
//         ).to.be.deep.equal({
//           token: COMP.address,
//           rescaleFactor: 10n,
//           shouldUpscale: false,
//           multiplier: MULTIPLIER_FACTOR,
//         });
//       });

//       it('allows governor to set rewards token with same scale', async () => {
//         const {
//           comet,
//           governor,
//           tokens: { COMP },
//         } = await makeProtocol({
//           assets: defaultAssets(
//             {},
//             {
//               COMP: { decimals: 6 },
//             }
//           ),
//         });
//         const { rewards } = await makeRewards({
//           governor,
//           configs: [[comet, COMP, MULTIPLIER_FACTOR]],
//         });

//         expect(
//           objectify(await rewards.rewardConfig(comet.address))
//         ).to.be.deep.equal({
//           token: COMP.address,
//           rescaleFactor: 1n,
//           shouldUpscale: true,
//           multiplier: MULTIPLIER_FACTOR,
//         });
//       });

//       it('does not allow anyone but governor to set config', async () => {
//         const {
//           comet,
//           governor,
//           tokens: { COMP },
//           users: [alice],
//         } = await makeProtocol();
//         const { rewards } = await makeRewards({ governor, configs: [] });

//         expect(await rewards.governor()).to.be.equal(governor.address);
//         await expect(
//           rewards
//             .connect(alice)
//             .setRewardConfigWithMultiplier(
//               comet.address,
//               COMP.address,
//               MULTIPLIER_FACTOR
//             )
//           //).to.be.revertedWith(`custom error 'NotPermitted("${alice.address}")'`);
//         ).to.be.revertedWith(`custom error 'NotPermitted(address)'`);
//       });
//     });
//   });
// }
