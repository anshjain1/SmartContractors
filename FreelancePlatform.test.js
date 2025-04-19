const FreelancePlatform = artifacts.require("FreelancePlatform");

contract("FreelancePlatform", (accounts) => {
  const freelancer = accounts[0];
  const client = accounts[1];
  const outsider = accounts[2];

  const serviceId = web3.utils.randomHex(12);
  const title = "Web Development";
  const price = web3.utils.toWei("1", "ether");

  let instance;

  before(async () => {
    instance = await FreelancePlatform.deployed();
  });

  it("should allow freelancer to offer service", async () => {
    await instance.offerService(serviceId, title, price, { from: freelancer });
    const service = await instance.services(serviceId);
    assert.equal(service.title, title);
    assert.equal(service.price, price);
  });

  it("should allow client to hire freelancer with exact payment", async () => {
    await instance.hireFreelancer(serviceId, { from: client, value: price });
    const service = await instance.services(serviceId);
    assert.equal(service.client, client);

    const escrowed = await instance.escrowedFunds(serviceId);
    assert.equal(escrowed.toString(), price);
  });

  it("should not allow payment release from non-client", async () => {
  try {
    await instance.releasePayment(serviceId, { from: outsider });
    assert.fail("Non-client should not be able to release payment");
  } catch (err) {
    assert(err.message.includes("Only client can call"), "Error message should indicate only client can release payment");
  }
});

  it("should allow client to release payment", async () => {
    const beforeBal = BigInt(await web3.eth.getBalance(freelancer));
    const tx = await instance.releasePayment(serviceId, { from: client });

    const service = await instance.services(serviceId);
    assert.equal(service.isCompleted, true);

    const afterBal = BigInt(await web3.eth.getBalance(freelancer));
    assert(afterBal > beforeBal, "Freelancer did not receive payment");
  });

  it("should prevent releasing payment again (double-spending)", async () => {
    try {
      await instance.releasePayment(serviceId, { from: client });
      assert.fail("Double-spending should be prevented");
    } catch (err) {
      assert(err.message.includes("Service already completed"));
    }
  });

  it("should allow refund after deadline if job not completed", async () => {
    const refundId = web3.utils.randomHex(12);
    await instance.offerService(refundId, "Logo Design", price, { from: freelancer });
    await instance.hireFreelancer(refundId, { from: client, value: price });

    // increase time by 4 days
    await timeTravel(4 * 24 * 60 * 60);

    const beforeBal = BigInt(await web3.eth.getBalance(client));
    const tx = await instance.refundClient(refundId, { from: client });

    const afterBal = BigInt(await web3.eth.getBalance(client));
    const service = await instance.services(refundId);

    assert.equal(service.isCompleted, true);
    assert(afterBal > beforeBal, "Client did not receive refund");
  });

  it("should prevent refund before deadline", async () => {
    const earlyRefundId = web3.utils.randomHex(12);
    await instance.offerService(earlyRefundId, "Mobile App", price, { from: freelancer });
    await instance.hireFreelancer(earlyRefundId, { from: client, value: price });

    try {
      await instance.refundClient(earlyRefundId, { from: client });
      assert.fail("Refund should not be allowed before deadline");
    } catch (err) {
      assert(err.message.includes("Refund not allowed before deadline"));
    }
  });

});

// Helper function to move time forward
async function timeTravel(seconds) {
  await new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "evm_increaseTime",
        params: [seconds],
        id: new Date().getTime(),
      },
      (err1) => {
        if (err1) return reject(err1);
        web3.currentProvider.send(
          {
            jsonrpc: "2.0",
            method: "evm_mine",
            id: new Date().getTime() + 1,
          },
          (err2, res) => {
            return err2 ? reject(err2) : resolve(res);
          }
        );
      }
    );
  });
}
