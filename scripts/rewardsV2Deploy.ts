/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import hre from 'hardhat';
import {
  CometRewardsV2__factory
} from '../build/types';
const { ethers } = hre;

const governor = process.env.GOVERNOR_ADDRESS;

async function main() {
  if (!governor) {
    throw new Error('GOVERNOR_ADDRESS is not set');
  }
  const [deployer] = await ethers.getSigners();

  console.log('\n --- Deployed data --- \n');
  console.log('* ', deployer.address, '- Deployer address');
  console.log('* ', governor, '- Governor address');
  console.log('\n --- ------- ---- --- ');

  const RewardsV2Factory = (await ethers.getContractFactory(
    'CometRewardsV2'
  )) as CometRewardsV2__factory;
  const rewardsV2 = await RewardsV2Factory.deploy(
    governor
  );

  console.log('\n --- ------- ---- --- ');
  console.log('Deployment is completed.');
  console.log('\n --- ------- ---- --- ');
  console.log('Verification is started...');
  await hre.run('verify:verify', {
    address: rewardsV2.address,
    constructorArguments: [governor],
  });
  console.log('Verification is completed.');

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
