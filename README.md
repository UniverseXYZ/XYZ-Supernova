# UniverseXYZ Supernova

Implements continuous rewards for staking XYZ in the DAO. Implements logic for determining DAO voting power based upon amount of XYZ deposited (which becomes vXYZ) plus a multiplier (up to 2x) awarded to those who lock their XYZ in the DAO for a specified period (up to 1 year). Those that lock their vXYZ for 1 year receive a 2x multiplier; those that lock their vXYZ for 6 months receive a 1.5x multiplier, and so on. Also allows users to delegate their vXYZ voting power to a secondary wallet address.
**NOTE:** The vXYZ multiplier ONLY affects voting power; it does NOT affect rewards. All users who stake XYZ receive the same reward rate regardless of the amount of time they have locked or not locked.

##  Contracts
### Supernova.sol
Allows users to deposit XYZ into the DAO, withdraw it, lock for a time period to increase their voting power (does not affect rewards), and delegate their vXYZ voting power to a secondary wallet address. Interacts with [Rewards.sol](https://github.com/UniverseXYZ/XYZ-Supernova/blob/master/contracts/Rewards.sol) contract to check balances and update upon deposit/withdraw. Interacts with [Governance.sol](https://github.com/UniverseXYZ/XYZ-DAO/blob/master/contracts/Governance.sol) contract to specify how much voting power (vXYZ) a wallet address has for use in voting on or creating DAO proposals.
#### Actions
- deposit
- withdraw
- lock
- delegate

### Rewards.sol
Rewards users who stake their XYZ on a continuous basis. Allows users to Claim their rewards which are then Transfered to their wallet. Interacts with the [CommunityVault.sol](https://github.com/UniverseXYZ/XYZ-YieldFarming/blob/master/contracts/CommunityVault.sol) which is the source of the XYZ rewards. The `Supernova` contract calls the `registerUserAction` hook on each `deposit`/`withdraw` the user executes, and sends the results to the `Rewards` contract.
#### How it works
1. every time the `acKFunds` function detects a balance change, the multiplier is recalculated by the following formula:
```
newMultiplier = oldMultiplier + amountAdded / totalXYZStaked
```
2. whenever a user action is registered (either by automatic calls from the hook or by user action (claim)), we calculate the amount owed to the user by the following formula:
```
newOwed = currentlyOwed + userBalance * (currentMultiplier - oldUserMultiplier)

where:
- oldUserMultiplier is the multiplier at the time of last user action
- userBalance = supernova.balanceOf(user) -- the amount of $XYZ staked into the Supernova
```
3. update the oldUserMultiplier with the current multiplier -- signaling that we already calculated how much was owed to the user since his last action

## Smart Contract Architecture
Overview
UniverseXYZ Supernova is a fork of BarnBridge Barn. It shares the same architecture:

![dao sc architecture](https://gblobscdn.gitbook.com/assets%2F-MIu3rMElIO-jG68zdaV%2F-MXHutr14sDo0hYi6gg3%2F-MXHwLegBZM5HWoEzudF%2Fdao.png?alt=media&token=51e3e2c7-4aab-4601-a3f1-46ae9e1b966f)


Check out more detailed smart contract Slither graphs with all the dependencies: [BarnBridge-Barn Slither Graphs](https://github.com/BarnBridge/sc-graphs/tree/main/BarnBridge-Barn).

### Specs
- user can stake XYZ for vXYZ
    - user can lock XYZ for a period up to 1 year and he gets a bonus of vXYZ
        - bonus is linear, max 1 year, max 2x multiplier
            - example:
                - lock 1000 XYZ for 1 year → get back 2000 vXYZ
                - lock 1000 XYZ for 6 months → get back 1500 vXYZ
        - bonus has a linear decay relative to locking duration
            - example: lock 1000 XYZ for 1 year, get back 2000 vXYZ at T0 → after 6 months, balance is 1500 vXYZ → after 9 months, balance is 1250 vXYZ
        - user can only withdraw their XYZ balance after lock expires
    - user can keep XYZ unlocked and no bonus is applied, vXYZ balance = XYZ balance
- user can stake more XYZ
    - no lock → just get back the same amount of vXYZ
    - lock
        - lock period stays the same
            - base balance is increased with the added XYZ
            - multiplier stays the same
        - lock period is extended
            - base balance is increased with the added XYZ
                - multiplier is recalculated relative to the new lock expiration date
- user can delegate vXYZ to another user
    - there can be only one delegatee at a time
    - only actual balance can be delegated, not the bonus
    - delegated balance cannot be locked
    - user can take back the delegated vXYZs at any time



## Initial Setup
### Install NVM and the latest version of NodeJS 12.x
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash
    # Restart terminal and/or run commands given at the end of the installation script
    nvm install 12
    nvm use 12
### Use Git to pull down the UniverseXYZ Supernova repository from GitHub
    git clone git@github.com:UniverseXYZ/XYZ-Supernova.git
    cd XYZ-Supernova
### Create config.ts using the sample template config.sample.ts
    cp config.sample.ts config.ts

## Updating the config.ts file
### Create an API key with Infura to deploy to Ethereum Public Testnet. In this guide, we are using Kovan.

1. Navigate to [Infura.io](https://infura.io/) and create an account
2. Log in and select "Get started and create your first project to access the Ethereum network"
3. Create a project and name it appropriately
4. Then, switch the endpoint to Rinkeby, copy the https URL and paste it into the section named `rinkeby`
5. Finally, insert the mnemonic phrase for your testing wallet. You can use a MetaMask instance, and switch the network to Rinkeby on the upper right. DO NOT USE YOUR PERSONAL METAMASK SEED PHRASE; USE A DIFFERENT BROWSER WITH AN INDEPENDENT METAMASK INSTALLATION
6. You'll need some Kovan-ETH (it is free) in order to pay the gas costs of deploying the contracts on the TestNet; you can use your GitHub account to authenticate to the [KovanFaucet](https://faucet.kovan.network/) and receive 2 Kovan-ETH for free every 24 hours

### Create an API key with Etherscan
1. Navigate to [EtherScan](https://etherscan.io/) and create an account
2. Log in and navigate to [MyAPIKey](https://etherscan.io/myapikey)
3. Use the Add button to create an API key, and paste it into the indicated section towards the bottom of the `config.ts` file

### Verify contents of config.ts; it should look like this:

```js
        import { NetworksUserConfig } from "hardhat/types";
        import { EtherscanConfig } from "@nomiclabs/hardhat-etherscan/dist/src/types";

        export const networks: NetworksUserConfig = {
            // Needed for `solidity-coverage`
            coverage: {
                url: "http://localhost:8555"
            },

            // Kovan
            kovan: {
                url: "https://kovan.infura.io/v3/INFURA-API-KEY",
                chainId: 42,
                accounts: {
                    mnemonic: "YourKovanTestWalletMnemonicPhrase",
                    path: "m/44'/60'/0'/0",
                    initialIndex: 0,
                    count: 10
                },
                gas: 3716887,
                gasPrice: 20000000000, // 20 gwei
                gasMultiplier: 1.5
            },

            // Mainnet
            mainnet: {
                url: "https://mainnet.infura.io/v3/YOUR-INFURA-KEY",
                chainId: 1,
                accounts: ["0xaaaa"],
                gas: "auto",
                gasPrice: 50000000000,
                gasMultiplier: 1.5
            }
        };

        // Use to verify contracts on Etherscan
        // https://buidler.dev/plugins/nomiclabs-buidler-etherscan.html
        export const etherscan: EtherscanConfig = {
            apiKey: "YourEtherscanAPIKey"
        };

```
## Installing

### Install NodeJS dependencies which include HardHat
    npm install

### Compile the contracts
    npm run compile

## Running Tests
    npm run test

**Note:** The result of tests is readily available [here](./test-results.md).
## Running Code Coverage Tests
    npm run coverage

## Audits
UniverseXYZ Supernova is a fork of BarnBridge Barn. Here you can find the audits for the original contract:

- [QuantStamp](https://github.com/BarnBridge/BarnBridge-PM/blob/master/audits/BarnBridge%20DAO%20audit%20by%20Quanstamp.pdf)
- [Haechi](https://github.com/BarnBridge/BarnBridge-PM/blob/master/audits/BarnBridge%20DAO%20audit%20by%20Haechi.pdf)

## Deployed contracts
### Mainnet
```shell
DiamondCutFacet deployed to: 0x441710f49EFe5CB0F50ffA4C24066269C141A68E
DiamondLoupeFacet deployed to: 0x75E333B48d71886C433c7BeB879a6601bd801Ec3
OwnershipFacet deployed to: 0x5c7cb19978CF51594A121C650D031761C73e75Cc
ChangeRewardsFacet deployed to: 0x7263ca0d7225BB4313E9Bc3e799eB2A48EcDF003
SupernovaFacet deployed at: 0x8aA4387412f18543b8D4cf16ef60E868a74F1f0d
-----
Supernova deployed at: 0x7b86600211e62B597E7CEA03476b9EFEb6872962
Rewards deployed at: 0xF306Ad6a3E2aBd5CFD6687A2C86998f1d9c31205
```

## Discussion
For any concerns with the platform, open an issue on GitHub.

Copyright 2021 UniverseXYZ DAO
