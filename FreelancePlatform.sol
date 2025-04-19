// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract FreelancePlatform is ReentrancyGuard {
    struct Service {
        string title;
        uint256 price;
        address payable freelancer;
        address payable client;
        bool isCompleted;
        uint256 deadline;
    }

    mapping(bytes12 => Service) public services;
    mapping(bytes12 => uint256) public escrowedFunds;

    event ServiceOffered(bytes12 indexed serviceId, string title, uint256 price, address freelancer);
    event FreelancerHired(bytes12 indexed serviceId, address client);
    event PaymentReleased(bytes12 indexed serviceId, address freelancer, uint256 amount);
    event ClientRefunded(bytes12 indexed serviceId, address client, uint256 amount);

    modifier serviceExists(bytes12 _id) {
        require(services[_id].freelancer != address(0), "Service does not exist");
        _;
    }

    modifier onlyClient(bytes12 _id) {
        require(msg.sender == services[_id].client, "Only client can call");
        _;
    }

    modifier notCompleted(bytes12 _id) {
        require(!services[_id].isCompleted, "Service already completed");
        _;
    }

    function offerService(bytes12 _id, string memory _title, uint256 _price) external {
        require(services[_id].freelancer == address(0), "Service ID already exists");
        services[_id] = Service({
            title: _title,
            price: _price,
            freelancer: payable(msg.sender),
            client: payable(address(0)),
            isCompleted: false,
            deadline: 0
        });

        emit ServiceOffered(_id, _title, _price, msg.sender);
    }

    function hireFreelancer(bytes12 _id) external payable serviceExists(_id) notCompleted(_id) {
        Service storage s = services[_id];
        require(s.client == address(0), "Service already hired");
        require(msg.sender != s.freelancer, "Freelancer cannot hire themselves");
        require(msg.value == s.price, "Incorrect payment amount");

        s.client = payable(msg.sender);
        s.deadline = block.timestamp + 3 days;
        escrowedFunds[_id] = msg.value;

        emit FreelancerHired(_id, msg.sender);
    }

    function releasePayment(bytes12 _id) external nonReentrant serviceExists(_id) onlyClient(_id) notCompleted(_id) {
        Service storage s = services[_id];
        uint256 amount = escrowedFunds[_id];
        require(amount > 0, "No funds to release");

        s.isCompleted = true;
        escrowedFunds[_id] = 0;
        s.freelancer.transfer(amount);

        emit PaymentReleased(_id, s.freelancer, amount);
    }

    function refundClient(bytes12 _id) external nonReentrant serviceExists(_id) onlyClient(_id) notCompleted(_id) {
        Service storage s = services[_id];
        require(block.timestamp >= s.deadline, "Refund not allowed before deadline");

        uint256 amount = escrowedFunds[_id];
        require(amount > 0, "No funds to refund");

        s.isCompleted = true;
        escrowedFunds[_id] = 0;
        s.client.transfer(amount);

        emit ClientRefunded(_id, s.client, amount);
    }
}
