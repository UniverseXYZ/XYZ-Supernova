import { ethers } from 'hardhat';
import { BigNumber, Signer } from 'ethers';
import * as helpers from './helpers/helpers';
import * as time from './helpers/time';
import { expect } from 'chai';
import { SupernovaMock, Erc20Mock, Rewards } from '../typechain';
import * as deploy from './helpers/deploy';

const zeroAddress = '0x0000000000000000000000000000000000000000';

describe('Rewards', function () {
    const amount = BigNumber.from(100).mul(BigNumber.from(10).pow(18));

    let supernova: SupernovaMock, xyz: Erc20Mock, rewards: Rewards;

    let user: Signer, userAddress: string;
    let happyPirate: Signer, happyPirateAddress: string;
    let flyingParrot: Signer, flyingParrotAddress: string;
    let communityVault: Signer, treasury: Signer;

    let defaultStartAt: number;

    let snapshotId: any;
    let snapshotTs: number;

    before(async function () {
        xyz = (await deploy.deployContract('ERC20Mock')) as Erc20Mock;

        await setupSigners();
        await setupContracts();

        supernova = (await deploy.deployContract('SupernovaMock')) as SupernovaMock;

        rewards = (await deploy.deployContract(
            'Rewards',
            [await treasury.getAddress(), xyz.address, supernova.address])
        ) as Rewards;

        await supernova.setRewards(rewards.address);
    });

    beforeEach(async function () {
        snapshotId = await ethers.provider.send('evm_snapshot', []);
        snapshotTs = await helpers.getLatestBlockTimestamp();
    });

    afterEach(async function () {
        await ethers.provider.send('evm_revert', [snapshotId]);

        await helpers.moveAtTimestamp(snapshotTs + 5);
    });

    describe('General', function () {
        it('should be deployed', async function () {
            expect(rewards.address).to.not.eql(0).and.to.not.be.empty;
        });

        it('sets correct owner', async function () {
            expect(await rewards.owner()).to.equal(await treasury.getAddress());
        });

        it('can set pullTokenFrom if called by owner', async function () {
            const startAt = await helpers.getLatestBlockTimestamp();
            const endsAt = startAt + 60 * 60 * 24 * 7;

            await expect(
                rewards.connect(happyPirate).setupPullToken(await communityVault.getAddress(), startAt, endsAt, amount)
            ).to.be.revertedWith('!owner');

            await expect(
                rewards.connect(treasury).setupPullToken(flyingParrotAddress, startAt, endsAt, amount)
            ).to.not.be.reverted;

            expect((await rewards.pullFeature()).source).to.equal(flyingParrotAddress);
        });

        it('sanitizes the parameters on call to setPullToken', async function () {
            const startAt = await helpers.getLatestBlockTimestamp();

            // checks on contract setup
            await expect(
                rewards.connect(treasury).setupPullToken(helpers.zeroAddress, startAt, startAt + 100, amount)
            ).to.be.revertedWith('contract is not setup, source must be != 0x0');

            await expect(
                rewards.connect(treasury).setupPullToken(flyingParrotAddress, startAt, 0, amount)
            ).to.be.revertedWith('endTs must be greater than startTs');

            await expect(
                rewards.connect(treasury).setupPullToken(flyingParrotAddress, startAt, startAt + 100, 0)
            ).to.be.revertedWith('setup contract: amount must be greater than 0');

            // setup the contract correctly and test contract disabling
            await expect(
                rewards.connect(treasury).setupPullToken(flyingParrotAddress, startAt, startAt + 100, amount)
            ).to.not.be.reverted;

            await expect(
                rewards.connect(treasury).setupPullToken(flyingParrotAddress, startAt, 0, amount)
            ).to.be.revertedWith('contract is already set up, source must be 0x0');

            await expect(
                rewards.connect(treasury).setupPullToken(helpers.zeroAddress, startAt, startAt + 100, amount)
            ).to.be.revertedWith('disable contract: startTs must be 0');

            await expect(
                rewards.connect(treasury).setupPullToken(helpers.zeroAddress, 0, startAt + 100, amount)
            ).to.be.revertedWith('disable contract: endTs must be 0');

            await expect(
                rewards.connect(treasury).setupPullToken(helpers.zeroAddress, 0, 0, amount)
            ).to.be.revertedWith('disable contract: amount must be 0');

            await expect(
                rewards.connect(treasury).setupPullToken(helpers.zeroAddress, 0, 0, 0)
            ).to.not.be.reverted;

            expect((await rewards.pullFeature()).source).to.be.equal(helpers.zeroAddress);

            expect(await rewards.disabled()).to.equal(true);

            await expect(
                rewards.connect(treasury).setupPullToken(flyingParrotAddress, startAt, startAt + 100, amount)
            ).to.be.revertedWith('contract is disabled');
        });

        it('can set supernova address if called by owner', async function () {
            await expect(rewards.connect(happyPirate).setSupernova(supernova.address))
                .to.be.revertedWith('!owner');

            await expect(rewards.connect(treasury).setSupernova(flyingParrotAddress))
                .to.not.be.reverted;

            expect(await rewards.supernova()).to.equal(flyingParrotAddress);
        });

        it('reverts if setSupernova called with 0x0', async function () {
            await expect(rewards.connect(treasury).setSupernova(helpers.zeroAddress))
                .to.be.revertedWith('supernova address must not be 0x0');
        });
    });

    describe('ackFunds', function () {
        it('calculates the new multiplier when funds are added', async function () {
            expect(await rewards.currentMultiplier()).to.equal(0);

            await xyz.mint(rewards.address, amount);
            await supernova.deposit(happyPirateAddress, amount);

            await expect(rewards.ackFunds()).to.not.be.reverted;

            expect(await rewards.currentMultiplier()).to.equal(helpers.tenPow18);
            expect(await rewards.balanceBefore()).to.equal(amount);

            await xyz.mint(rewards.address, amount);

            await expect(rewards.ackFunds()).to.not.be.reverted;
            expect(await rewards.currentMultiplier()).to.equal(helpers.tenPow18.mul(2));
            expect(await rewards.balanceBefore()).to.equal(amount.mul(2));
        });

        it('does not change multiplier on funds balance decrease but changes balance', async function () {
            await xyz.mint(rewards.address, amount);
            await supernova.deposit(happyPirateAddress, amount);

            await expect(rewards.ackFunds()).to.not.be.reverted;
            expect(await rewards.currentMultiplier()).to.equal(helpers.tenPow18);
            expect(await rewards.balanceBefore()).to.equal(amount);

            await xyz.burnFrom(rewards.address, amount.div(2));

            await expect(rewards.ackFunds()).to.not.be.reverted;
            expect(await rewards.currentMultiplier()).to.equal(helpers.tenPow18);
            expect(await rewards.balanceBefore()).to.equal(amount.div(2));

            await xyz.mint(rewards.address, amount.div(2));
            await rewards.ackFunds();

            // 1 + 50 / 100 = 1.5
            expect(await rewards.currentMultiplier()).to.equal(helpers.tenPow18.add(helpers.tenPow18.div(2)));
        });
    });

    describe('registerUserAction', function () {
        it('can only be called by supernova', async function () {
            await expect(rewards.connect(happyPirate).registerUserAction(flyingParrotAddress))
                .to.be.revertedWith('only callable by supernova');

            await supernova.deposit(happyPirateAddress, amount);

            await expect(supernova.callRegisterUserAction(happyPirateAddress)).to.not.be.reverted;
        });

        it('does not pull xyz if function is disabled', async function () {
            await supernova.callRegisterUserAction(happyPirateAddress);

            expect(await xyz.balanceOf(rewards.address)).to.equal(0);

            await xyz.connect(communityVault).approve(rewards.address, amount);

            const startAt = await helpers.getLatestBlockTimestamp();
            const endsAt = startAt + 60 * 60 * 24 * 7;
            await rewards.connect(treasury).setupPullToken(await communityVault.getAddress(), startAt, endsAt, amount);
            await supernova.deposit(happyPirateAddress, amount);

            await helpers.moveAtTimestamp(startAt + time.day);
            await supernova.callRegisterUserAction(happyPirateAddress);

            // total time is 7 days & total amount is 100  => 1 day worth of rewards ~14.28
            const balance = await xyz.balanceOf(rewards.address);
            expect(balance.gt(BigNumber.from(14).mul(helpers.tenPow18))).to.be.true;
            expect(balance.lt(BigNumber.from(15).mul(helpers.tenPow18))).to.be.true;
        });

        it('does not pull xyz if already pulled everything', async function () {
            const { start, end } = await setupRewards();

            await helpers.moveAtTimestamp(end + 1 * time.day);

            await supernova.callRegisterUserAction(happyPirateAddress);

            expect(await xyz.balanceOf(rewards.address)).to.equal(amount);

            await helpers.moveAtTimestamp(end + 1 * time.day);
            await supernova.callRegisterUserAction(happyPirateAddress);

            expect(await xyz.balanceOf(rewards.address)).to.equal(amount);
        });

        it('updates the amount owed to user but does not send funds', async function () {
            await xyz.connect(communityVault).approve(rewards.address, amount);

            await supernova.deposit(happyPirateAddress, amount);

            await helpers.moveAtTimestamp(defaultStartAt + time.day);

            expect(await xyz.balanceOf(happyPirateAddress)).to.equal(0);

            const balance = await xyz.balanceOf(rewards.address);
            expect(balance.gte(0)).to.be.true;
            expect(await rewards.owed(happyPirateAddress)).to.equal(balance);
        });
    });

    describe('claim', function () {
        it('reverts if user has nothing to claim', async function () {
            await expect(rewards.connect(happyPirate).claim()).to.be.revertedWith('nothing to claim');
        });

        it('transfers the amount to user', async function () {
            const { start, end } = await setupRewards();

            await supernova.deposit(happyPirateAddress, amount);
            const depositTs = await helpers.getLatestBlockTimestamp();

            const expectedBalance1 = calcTotalReward(start, depositTs, end - start, amount);

            await helpers.moveAtTimestamp(start + time.day);

            await expect(rewards.connect(happyPirate).claim()).to.not.be.reverted;
            const claimTs = await helpers.getLatestBlockTimestamp();

            const expectedBalance2 = calcTotalReward(depositTs, claimTs, end - start, amount);

            expect(await xyz.transferCalled()).to.be.true;
            expect(await xyz.balanceOf(happyPirateAddress)).to.be.equal(expectedBalance1.add(expectedBalance2));
            expect(await rewards.owed(happyPirateAddress)).to.be.equal(0);
            expect(await rewards.balanceBefore()).to.be.equal(0);
        });

        it('works with multiple users', async function () {
            const { start, end } = await setupRewards();

            await supernova.deposit(happyPirateAddress, amount);
            const deposit1Ts = await helpers.getLatestBlockTimestamp();
            const expectedBalance1 = calcTotalReward(start, deposit1Ts, end - start, amount);

            expect(await xyz.balanceOf(rewards.address)).to.equal(expectedBalance1);

            await supernova.deposit(flyingParrotAddress, amount);
            const deposit2Ts = await helpers.getLatestBlockTimestamp();
            const expectedBalance2 = calcTotalReward(deposit1Ts, deposit2Ts, end - start, amount);

            expect(await xyz.balanceOf(rewards.address)).to.equal(expectedBalance1.add(expectedBalance2));

            await supernova.deposit(userAddress, amount);
            const deposit3Ts = await helpers.getLatestBlockTimestamp();
            const expectedBalance3 = calcTotalReward(deposit2Ts, deposit3Ts, end - start, amount);

            expect(await xyz.balanceOf(rewards.address))
                .to.equal(expectedBalance1.add(expectedBalance2).add(expectedBalance3));

            await helpers.moveAtTimestamp(start + 10 * time.day);

            await rewards.connect(happyPirate).claim();
            const multiplier = await rewards.currentMultiplier();
            const expectedReward = multiplier.mul(amount).div(helpers.tenPow18);

            expect(await xyz.balanceOf(happyPirateAddress)).to.equal(expectedReward);
        });

        it('works fine after claim', async function () {
            const { start, end } = await setupRewards();

            await supernova.deposit(happyPirateAddress, amount);
            const deposit1Ts = await helpers.getLatestBlockTimestamp();
            const expectedBalance1 = calcTotalReward(start, deposit1Ts, end - start, amount);

            expect(await xyz.balanceOf(rewards.address)).to.equal(expectedBalance1);

            await supernova.deposit(flyingParrotAddress, amount);
            const deposit2Ts = await helpers.getLatestBlockTimestamp();
            const multiplierAtDeposit2 = await rewards.currentMultiplier();
            const expectedBalance2 = calcTotalReward(deposit1Ts, deposit2Ts, end - start, amount);

            expect(await xyz.balanceOf(rewards.address)).to.equal(expectedBalance1.add(expectedBalance2));

            await supernova.deposit(userAddress, amount);
            const deposit3Ts = await helpers.getLatestBlockTimestamp();
            const expectedBalance3 = calcTotalReward(deposit2Ts, deposit3Ts, end - start, amount);

            expect(await xyz.balanceOf(rewards.address))
                .to.equal(expectedBalance1.add(expectedBalance2).add(expectedBalance3));

            await helpers.moveAtTimestamp(start + 1 * time.day);

            await rewards.connect(happyPirate).claim();
            const claim1Ts = await helpers.getLatestBlockTimestamp();
            const claim1Multiplier = await rewards.currentMultiplier();
            const expectedReward = claim1Multiplier.mul(amount).div(helpers.tenPow18);

            expect(await xyz.balanceOf(happyPirateAddress)).to.equal(expectedReward);

            // after the first claim is executed, move 1 more day into the future which would increase the
            // total reward by ~14.28 (one day worth of reward)
            // happyPirate already claimed his reward for day 1 so he should only be able to claim one day worth of rewards
            // flyingParrot did not claim before so he should be able to claim 2 days worth of rewards
            // since there are 3 users, 1 day of rewards for one user is ~4.76 tokens
            await helpers.moveAtTimestamp(start + 2 * time.day);

            await rewards.connect(happyPirate).claim();
            const claim2Ts = await helpers.getLatestBlockTimestamp();

            const expectedRewardDay2 = calcTotalReward(claim1Ts, claim2Ts, end - start, amount);
            const expectedMultiplier = claim1Multiplier.add(expectedRewardDay2.mul(helpers.tenPow18).div(amount.mul(3)));

            const claim2Multiplier = await rewards.currentMultiplier();
            expect(claim2Multiplier).to.equal(expectedMultiplier);

            const expectedReward2 = (claim2Multiplier.sub(claim1Multiplier)).mul(amount).div(helpers.tenPow18);
            expect(
                expectedReward2.gt(BigNumber.from(4).mul(helpers.tenPow18)) &&
                expectedReward2.lt(BigNumber.from(5).mul(helpers.tenPow18))
            ).to.be.true;
            expect(await xyz.balanceOf(happyPirateAddress)).to.equal(expectedReward.add(expectedReward2));

            await rewards.connect(flyingParrot).claim();
            const multiplier3 = await rewards.currentMultiplier();
            const expectedReward3 = multiplier3.sub(multiplierAtDeposit2).mul(amount).div(helpers.tenPow18);
            expect(
                expectedReward3.gt(BigNumber.from(9).mul(helpers.tenPow18)) &&
                expectedReward3.lt(BigNumber.from(10).mul(helpers.tenPow18))).to.be.true;
            expect(await xyz.balanceOf(flyingParrotAddress)).to.equal(expectedReward3);
        });
    });

    async function setupRewards (): Promise<{ start: number, end: number }> {
        const startAt = await helpers.getLatestBlockTimestamp();
        const endsAt = startAt + 60 * 60 * 24 * 7;
        await rewards.connect(treasury).setupPullToken(await communityVault.getAddress(), startAt, endsAt, amount);
        await xyz.connect(communityVault).approve(rewards.address, amount);

        return { start: startAt, end: endsAt };
    }

    function calcTotalReward (startTs: number, endTs: number, totalDuration: number, totalAmount: BigNumber): BigNumber {
        const diff = endTs - startTs;
        const shareToPull = BigNumber.from(diff).mul(helpers.tenPow18).div(totalDuration);

        return shareToPull.mul(totalAmount).div(helpers.tenPow18);
    }

    async function setupContracts () {
        const cvValue = BigNumber.from(2800000).mul(helpers.tenPow18);
        const treasuryValue = BigNumber.from(4500000).mul(helpers.tenPow18);

        await xyz.mint(await communityVault.getAddress(), cvValue);
        await xyz.mint(await treasury.getAddress(), treasuryValue);
    }

    async function setupSigners () {
        const accounts = await ethers.getSigners();
        user = accounts[0];
        communityVault = accounts[1];
        treasury = accounts[2];
        happyPirate = accounts[3];
        flyingParrot = accounts[4];

        userAddress = await user.getAddress();
        happyPirateAddress = await happyPirate.getAddress();
        flyingParrotAddress = await flyingParrot.getAddress();
    }
});
