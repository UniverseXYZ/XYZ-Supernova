import * as helpers from '../test/helpers/helpers';
import { Contract } from 'ethers';
import * as deploy from '../test/helpers/deploy';
import { diamondAsFacet } from '../test/helpers/diamond';
import { SupernovaFacet } from '../typechain';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

const facetAddresses = new Map([
    ['DiamondCutFacet', '0x9d1c7F3670533487a22767Da6a8CEdE1b00C3c53'],
    ['DiamondLoupeFacet', '0x151586da6d89345C839DdCc0F290f425B8B10AEB'],
    ['OwnershipFacet', '0x45c1a21C800119aF24F9968380D5570A25C3cb8F'],
]);

const _xyz = '0x86dEddCFc3a7DBeE68cDADA65Eed3D3b70F4fe24';
const _owner = '0x39aE4d18f1feb3708CaCCC39F1Af3e8C26D577d5';
const _dao = '0x889AF716442bAdfB7F546745973dE9073CEBA6aC';

const _supernova = '0xA95281904827E1758252bB49eCd5D3Cf06F2040e';
const _rewards = '0xA287c145d4D89C746D7CfdB875B8362a8Aa90987';

// needed for rewards setup
const _cv = '0x3317cc09ce0da6751b4E0b7c56114bA833D3d232';
const startTs = 1620302354;
const endTs = 1642982400;
const rewardsAmount = BigNumber.from(1000).mul(helpers.tenPow18);

async function main () {
    const diamond = await ethers.getContractAt('Supernova', _supernova);
    const rewards = await ethers.getContractAt('Rewards', _rewards);

    // console.log('Calling initSupernova');
    // const supernova = (await diamondAsFacet(diamond, 'SupernovaFacet')) as SupernovaFacet;
    // await supernova.initSupernova(_xyz, rewards.address);

    await rewards.setupPullToken(_cv, startTs, endTs, rewardsAmount);
}

async function getFacets (): Promise<Contract[]> {
    const facets: Contract[] = [];

    for (const key of facetAddresses.keys()) {
        facets.push(await helpers.contractAt(key, facetAddresses.get(key) || ''));
    }

    return facets;
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
