const fetch = require("cross-fetch")
import axios from 'axios'

var Web3 = require('web3');
var Contract = require('web3-eth-contract');
// set provider for all later instances to use
Contract.setProvider(new Web3.providers.HttpProvider('https://eth-mainnet.alchemyapi.io/v2/ZiRLHRMU4UKAJ8mPEvTbJq35YdCm5MxJ')); 

var fs = require('fs').promises;

const { human_standard_token_abi } = require('./token_abi');

//https://github.com/sebs/etherscan-api 
const API_KEY = process.env.ETHERSCAN_API_KEY
var api = require('etherscan-api').init(API_KEY); 

async function getTokenBalanceforWallet(wallet, token, block) {
  let contract = new Contract(human_standard_token_abi, token);
  const bal = await contract.methods.balanceOf(wallet).call(block) 
  const decimals = await contract.methods.decimals().call()
  return [bal/(10**decimals), decimals];
}

async function getTokenSymbol(token) {
  let contract = new Contract(human_standard_token_abi, token);
  const symbol = await contract.methods.symbol().call()
  return symbol
}

//pad the hex string to 64 bytes
function padHexString(hexString) {
  const mainStr = hexString.slice(2)
  const zeros = 64 - mainStr.length 
  return '0x' + '0'.repeat(zeros) + mainStr
}

async function getApprovals(account, contract, fromBlock = 1, toBlock ='latest') {
  const approvalFuncHash = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';
  const account_str = padHexString(account)
  const contract_str = padHexString(contract)

  const api_url =`https://api.etherscan.io/api?module=logs&action=getLogs&fromBlock=${fromBlock}&toBlock=${toBlock}&topic0=${approvalFuncHash}&topic0_1_opr=and&topic1=${account_str}&topic1_2_opr=and&topic2=${contract_str}&apikey=${API_KEY}`

  try {
    const results = await axios.get(api_url);
    const res_list = results.data.result
    var token2limits = {}
    for (var j =0; j < res_list.length; j++) {
      const approval = res_list[j]
      token2limits[approval.address] = approval.data
    }
    var output_string = ""
    for (let token in token2limits) {
      const [balance, decimals] = await getTokenBalanceforWallet(account, token, toBlock)
      const tlimit = parseInt(token2limits[token])/(10**decimals)
      output_string += `${account}\t${token}\t${tlimit}\t${balance}\t${decimals}\n`
    }
    
    return output_string
  } catch (error) {
    console.log(error)
  }

}

const util = require('util');
const exec = util.promisify(require('child_process').exec);
async function exec_command(cmd) {
  try {
      const { stdout, stderr } = await exec(cmd);
      return stdout
      //console.log('stdout:', stdout);
      console.log('stderr:', stderr);
  } catch (err) {
     console.error(err);
  };
};


async function getWalletsForContract(contract, start_block, end_block, output_file) {
  // Get all the wallets that have interacted with contract 
  const batchSize = 100;
  var pageNum = 1;
  var count = batchSize;
  var totalCount = 0;
  await fs.writeFile(output_file, '', {flag: "w"});
  try {
    while ((count+0.1) >= batchSize) {
      const transactions = await api.account.txlist(contract, start_block, end_block, pageNum, batchSize, 'asc')
      count = transactions.result.length;
      totalCount += count;
      console.log("Start Block: ", start_block, "Total transactions: ", totalCount);
      for (var j = 0; j < count; j++) {
        await fs.writeFile(output_file, transactions.result[j].from + "\n", {flag: "a"});
      }
      pageNum++;
    }
  } catch (error) {
     console.log(error);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function getTokenPrices(wallet_impact_file) {
  var token2usd = {}
  const fsf = require('fs');
  const readline = require('readline');

  const fileStream = fsf.createReadStream(wallet_impact_file);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    // Each line in input.txt will be successively available here as `line`.
    const fields = line.split("\t")
    if (parseFloat(fields[3]) > 1e-10) {
      token2usd[fields[1]] = 0;
    }
  }
  const token_list = Object.keys(token2usd)
  for (var j = 0; j < token_list.length; j++) {
    const token = token_list[j]
    const price_url = `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${token}&vs_currencies=usd`
    token2usd[token] = {symbol: '', usd_price: 0 }
    
    try {
      const symbol = await getTokenSymbol(token)
      token2usd[token].symbol = symbol
      const res = await axios.get(price_url)
      console.log(symbol)
      if (res.data) {
        token2usd[token].usd_price = res.data[token].usd
      }
      await sleep(700) //to not hit the coingecko api limit

    } catch(error) {
      console.log(error);
    }
  }

  return token2usd
}

  
async function outputLoss(output_file, token_file, loss_file) {
  const fsf = require('fs');
  const readline = require('readline');

  var token2usd = {}
  const token_content = await exec_command(`cat ${token_file}`)
  const lines = token_content.split("\n");
  for (var j = 0; j < lines.length; j++) {
    const line = lines[j]
    const [token, symbol, price] = line.split("\t")
    token2usd[token] = {symbol: symbol, usd_price: price}
  }

  const fileStream = fsf.createReadStream(output_file);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  await fs.writeFile(loss_file, '', {flag: "w"});
  for await (const line of rl) {
    // Each line in input.txt will be successively available here as `line`.
    const fields = line.split("\t")
    const balance = parseFloat(fields[3])
    const tlimit = parseFloat(fields[2])
    const loss = tlimit < balance ? tlimit : balance
    if (balance > 1e-10) {
      const wallet = fields[0]
      const token = fields[1]
      const token_info = token2usd[token]
      const price = token_info.usd_price
      const symbol = token_info.symbol
      const usd_loss = loss * token_info.usd_price
      const output_str = `${wallet}\t${token}\t${tlimit}\t${balance}\t${symbol}\t${loss}\t${price}\t${usd_loss}\n`
      await fs.writeFile(loss_file, output_str, {flag: "a"});
    }
  }

}

async function main() {
  const furucombo_contract = '0x17e8ca1b4798b97602895f63206afcd1fc90ca5f'

  const last_furu_block = 11940503 
  const first_furu_block = 11618386
  const middle_block = parseInt((first_furu_block + last_furu_block)/2)
  
  
  await getWalletsForContract(furucombo_contract, first_furu_block, middle_block, 'furu_wallets.1.txt') 
  await getWalletsForContract(furucombo_contract, middle_block +1, last_furu_block, 'furu_wallets.2.txt') 
  await exec_command("sort furu_wallets.1.txt furu_wallets.2.txt | uniq > furu_wallets.txt");
  
  

  // get the approval data and allowance
  const output_file = 'wallet_impact.txt';
  const loss_output_file = 'wallet_loss.txt'; 
  const token_file = 'token_info.txt'

  
  const wallet_data = await exec_command("cat furu_wallets.txt")
  const wallets = wallet_data.split("\n");
  await fs.writeFile(output_file, '', {flag: "w"});
  for (var w = 0 ; w < wallets.length ; w ++) {
      const result = await getApprovals(wallets[w], furucombo_contract,
                                        1, last_furu_block)
      if (result) {
        await fs.writeFile(output_file, result, {flag: "a"});
      }
      console.log("Wallet processed:", wallets[w]);
  }
  const token2usd = await getTokenPrices(output_file);
  console.log(token2usd)
  await fs.writeFile(token_file, '', {flag: "w"});
  for (let token in token2usd) {
    const symbol = token2usd[token].symbol
    const price = token2usd[token].usd_price || 0
    await fs.writeFile(token_file, `${token}\t${symbol}\t${price}\n`, {flag: "a"});
  }
  

  await outputLoss(output_file, token_file, loss_output_file); 
  
}

main();

