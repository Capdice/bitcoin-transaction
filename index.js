let bitcoin = require('bitcoinjs-lib');
let request = require('superagent');

let BITCOIN_DIGITS = 8;
let BITCOIN_SAT_MULT = Math.pow(10, BITCOIN_DIGITS);

let providers = {
	/**
	 * Input: Address to retrieve the balance from.
	 * Output: The balance in Satoshis.
	 */
	balance: {
		mainnet: {
			blockexplorer: function (addr) {
				return request.get('https://blockexplorer.com/api/addr/' + addr + '/balance').send().then(function (res) {
					return parseFloat(res.body);
				});
			},
			blockchain: function (addr) {
				return request.get('https://blockchain.info/q/addressbalance/' + addr + '?confirmations=6').send().then(function (res) {
					return parseFloat(res.body);
				});
			}
		},
		testnet: {
			blockexplorer: function (addr) {
				return request.get('https://testnet.blockexplorer.com/api/addr/' + addr + '/balance').send().then(function (res) {
					return parseFloat(res.body);
				});
			}
		}
	},
	/**
	 * Input: Requested processing speed. "fastest", "halfHour" or "hour"
	 * Output: Fee rate in Satoshi's per Byte.
	 */
	fees: {
		mainnet: {
			earn: function (feeName) {
				return request.get('https://bitcoinfees.earn.com/api/v1/fees/recommended').send().then(function (res) {
					return res.body[feeName + "Fee"];
				});
			}
		},
		testnet: {
			earn: function (feeName) {
				return request.get('https://bitcoinfees.earn.com/api/v1/fees/recommended').send().then(function (res) {
					return res.body[feeName + "Fee"];
				});
			}
		}
	},
	/**
	 * Input: Sending user's BitCoin wallet address.
	 * Output: List of utxo's to use. Must be in standard format. { txid, vout, satoshis, confirmations }
	 */
	utxo: {
		mainnet: {
			blockexplorer: function (addr) {
				return request.get('https://blockexplorer.com/api/addr/' + addr + '/utxo?noCache=1').send().then(function (res) {
					return res.body.map(function (e) {
						return {
							txid: e.txid,
							vout: e.vout,
							satoshis: e.satoshis,
							confirmations: e.confirmations
						};
					});
				});
			},
			blockchain: function (addr) {
				return request.get('https://blockchain.info/unspent?active=' + addr).send().then(function (res) {
					return res.body.unspent_outputs.map(function (e) {
						return {
							txid: e.tx_hash_big_endian,
							vout: e.tx_output_n,
							satoshis: e.value,
							confirmations: e.confirmations
						};
					});
				});
			}
		},
		testnet: {
			blockexplorer: function (addr) {
				return request.get('https://testnet.blockexplorer.com/api/addr/' + addr + '/utxo?noCache=1').send().then(function (res) {
					return res.body.map(function (e) {
						return {
							txid: e.txid,
							vout: e.vout,
							satoshis: e.satoshis,
							confirmations: e.confirmations
						};
					});
				});
			}
		}
	},
	/**
	 * Input: A hex string transaction to be pushed to the blockchain.
	 * Output: None
	 */
	pushtx: {
		mainnet: {
			blockexplorer: function (hexTrans) {
				return request.post('https://blockexplorer.com/api/tx/send').send('rawtx: ' + hexTrans);
			},
			blockchain: function (hexTrans) {
				return request.post('https://blockchain.info/pushtx').send('tx=' + hexTrans);
			}
		},
		testnet: {
			blockexplorer: function (hexTrans) {
				return request.post('https://testnet.blockexplorer.com/api/tx/send').send('rawtx: ' + hexTrans);
			},
			blockcypher: function (hexTrans) {
				return request.post('https://api.blockcypher.com/v1/btc/test3/txs/push').send('{"tx":"' + hexTrans + '"}');
			}
		}
	},

	txnInfo: {
		mainnet: {
			blockexplorer: (txnHash) => {
				return request.get('https://blockexplorer.com/api/tx/' + txnHash).send()
			}
		},

		testnet: {
			blockexplorer: (txnHash) => {
				return request.get('https://testnet.blockexplorer.com/api/tx/' + txnHash).send()
			}
		}
	}
}

//Set default providers
providers.balance.mainnet.default = providers.balance.mainnet.blockexplorer;
providers.balance.testnet.default = providers.balance.testnet.blockexplorer;
providers.fees.mainnet.default = providers.fees.mainnet.earn;
providers.fees.testnet.default = providers.fees.testnet.earn;
providers.utxo.mainnet.default = providers.utxo.mainnet.blockexplorer;
providers.utxo.testnet.default = providers.utxo.testnet.blockexplorer;
providers.pushtx.mainnet.default = providers.pushtx.mainnet.blockchain;
providers.pushtx.testnet.default = providers.pushtx.testnet.blockcypher;
providers.txnInfo.mainnet.default = providers.txnInfo.mainnet.blockexplorer;
providers.txnInfo.testnet.default = providers.txnInfo.testnet.blockexplorer;

function getBalance(addr, options) {
	if (options == null) options = {};
	if (options.network == null) options.network = "mainnet";
	if (options.balanceProvider == null) options.balanceProvider = providers.balance[options.network].default;

	return options.balanceProvider(addr).then(function (balSat) {
		return balSat;
	});
}

function getTransactionSize(numInputs, numOutputs) {
	return numInputs * 180 + numOutputs * 34 + 10 + numInputs;
}

function getFees(provider, feeName) {
	if (typeof feeName === 'number') {
		return new Promise.resolve(feeName);
	} else {
		return provider(feeName);
	}
}

async function sendTransaction(options) {
	//Required
	if (options == null || typeof options !== 'object') throw "Options must be specified and must be an object.";
	if (options.from == null) throw "Must specify from address.";
	if (options.to == null) throw "Must specify to address.";
	if (options.amount == null) throw "Must specify amount of Satoshi to send.";
	if (options.privKeyWIF == null) throw "Must specify the wallet's private key in WIF format.";


	//Optionals
	if (options.network == null) options.network = 'mainnet';
	if (options.fee == null) options.fee = 'fastest';
	if (options.feesProvider == null) options.feesProvider = providers.fees[options.network].default;
	if (options.utxoProvider == null) options.utxoProvider = providers.utxo[options.network].default;
	if (options.pushtxProvider == null) options.pushtxProvider = providers.pushtx[options.network].default;
	if (options.dryrun == null) options.dryrun = false;
	if (options.emptyWallet == null) options.emptyWallet = false;

	let from = options.from;
	let to = options.to;
	let amtSatoshi = options.amount;
	let bitcoinNetwork = options.network == "testnet" ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;

	let feePerByte = await getFees(options.feesProvider, options.fee)
	let utxos = await options.utxoProvider(from);

	//Setup inputs from utxos
	let tx = new bitcoin.TransactionBuilder(bitcoinNetwork);
	let ninputs = 0;
	let availableSat = 0;
	for (let i = 0; i < utxos.length; i++) {
		let utxo = utxos[i];
		if (utxo.confirmations >= 6) {
			tx.addInput(utxo.txid, utxo.vout);
			availableSat += utxo.satoshis;
			ninputs++;

			if (availableSat >= amtSatoshi) break;
		}
	}

	if (availableSat < amtSatoshi) throw "You do not have enough in your wallet to send that much. Available: " + availableSat + "\t\t Required: " + amtSatoshi;

	let change = availableSat - amtSatoshi;
	let fee = getTransactionSize(ninputs, change > 0 ? 2 : 1) * feePerByte;
	if (fee > amtSatoshi) throw "BitCoin amount must be larger than the fee. (Ideally it should be MUCH larger)";
	tx.addOutput(to, amtSatoshi - fee);
	if (change > 0) tx.addOutput(options.emptyWallet ? to : from, change);
	let keyPair = bitcoin.ECPair.fromWIF(options.privKeyWIF, bitcoinNetwork);
	for (let i = 0; i < ninputs; i++) {
		tx.sign(i, keyPair);
	}
	let msg = tx.build().toHex();
	if (options.dryrun) {
		return tx;
	} else {
		return await options.pushtxProvider(msg);
	}

}

function getTransactionInfo(options) {
	//Required
	if (options == null || typeof options !== 'object') throw "Options must be specified and must be an object.";
	if (options.txnHash == null) throw "Must specify the hash";

	//Optionals
	if (options.network == null) options.network = 'mainnet';
	if (options.fee == null) options.fee = 'fastest';
	if (options.txnInfoProvider == null) options.txnInfoProvider = providers.txnInfo[options.network].default;

	return options.txnInfoProvider(options.txnHash);
}

module.exports = {
	providers: providers,
	getBalance: getBalance,
	sendTransaction: sendTransaction,
	getTxnInfo: getTransactionInfo
}
