const fs = require("fs");
// const dotenv = require("dotenv");
// const { ethers } = require("ethers");

async function main() {
  const network = hre.network.name;

  let TOKEN_NAME = process.env.TOKEN_NAME;
  let TOKEN_SYMBOL = process.env.TOKEN_SYMBOL;
  let TOKEN_OWNER, PLATFORM_ADDRESS;

  const [deployer] = await hre.ethers.getSigners();
  TOKEN_OWNER = deployer.address;
  console.log("Deploying trading platform with account: ", TOKEN_OWNER);

  const balance = await deployer.getBalance();
  console.log("Account balance: ", balance.toString());
  
  const TradingPlatform = await hre.ethers.getContractFactory("TradingPlatform");
  const tradingPlatform = await TradingPlatform.deploy(TOKEN_NAME, TOKEN_SYMBOL);
  PLATFORM_ADDRESS = tradingPlatform.address;
  console.log("Trading platform deployed to: ", PLATFORM_ADDRESS);  

  console.log(1)
  await tradingPlatform.deployTransaction.wait()
  console.log(2)
  const tokenAddress = await tradingPlatform.targetTokenAddress();
  console.log(2)
  console.log(tokenAddress)
  
  let networkEnvData = `DEPLOYER_MNEMONIC = ${process.env.MNEMONIC}`
  + `\nDEPLOYER_PRIVATE_KEY = ${process.env.PRIVATE_KEY}`
  + `\nDEPLOYER_PRIVATE_KEY_2 = ${process.env.PRIVATE_KEY_2}`
  + `\nDEPLOYER_PRIVATE_KEY_3 = ${process.env.PRIVATE_KEY_3}`
  + `\n\n#Token info:`
  + `\nTOKEN_NAME = ${TOKEN_NAME}`
  + `\nTOKEN_SYMBOL = ${TOKEN_SYMBOL}`
  + `\nTOKEN_SUPPLY = 18`
  + `\nOWNER_ADDRESS = ${TOKEN_OWNER}`
  + `\nPLATFORM_ADDRESS = ${PLATFORM_ADDRESS}`
  + `\nTOKEN_ADDRESS = ${tokenAddress}`;

  fs.writeFileSync(
    `.env-${network}`,
    networkEnvData
  )
  }
  
  main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });