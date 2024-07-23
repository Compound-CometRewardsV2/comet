import hre from 'hardhat';

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  // Deployment.
  const CometRewardsV2Factory = (await hre.ethers.getContractFactory('CometRewardsV2')).connect(deployer);
  const cometRewardsV2 = await CometRewardsV2Factory.deploy(deployer.address);
  await cometRewardsV2.deployed();

  console.log('CometRewardsV2 deployed to:', cometRewardsV2.address);

  console.log('Verification of the contract is started...');
  if (hre.network.name !== 'hardhat' && hre.network.name !== 'localhost') {
    console.log('Sleeping before verification...');
    await new Promise((resolve) => setTimeout(resolve, 60000)); // 60 seconds.
    await hre.run('verify:verify', {
      address: cometRewardsV2.address,
      constructorArguments: [deployer.address],
    });
  }
  console.log('Verification of the contract is completed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
   