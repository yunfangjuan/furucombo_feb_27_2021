# Potential Loss Analysis for Furucombo 2/27/2021

# Overview

This is a post mortem analysis of the [furucombo hack](https://cointelegraph.com/news/transaction-batching-protocol-furucombo-suffers-14-million-evil-contract-hack) on 2/27/2021. This attach is an approval attack that a spoofed contract
transferred approved tokens from users' wallets to its own wallet. The hack was stopped after about an hour but if the hacker went 
on, more wallets could have been wiped. This analysis aimed to provided a picture of the potential loss if the hack went undetected for
much longer. 

This exercise also signifies that the hacker must have done a thorough analysis on token limit approvals for Furucombo contract.
If we sorted the potential losses in the descending order, we can clearly see that the hacker attacked the largest account first. 
This should serve as a hint of how to identify the hacker since the hacker must have pulled this data from ethereum nodes or 
a data platform like etherscan.   

# Methodology
In `furucombo.js`, we took the following steps to identity the potential loss. We base most of the calculations between block 11618386 
and block 11940503. The former represents the Furucombo contract creation time and the latter represents the last block before the attack. 

 1. Get the list of wallets that have ever interacted with Furucombo between the blocks. (This doesn't include wallets that might have approaved tokens but never transacted. (so this is an underestimate.)
 2. Get the token approval limits of furocombothe wallets from step 1 and also the token balance for the wallet at the lasst block before the attack 
 3. Go through 2 and get the list of tokens that could have been stolen. Check the current price of the tokens through Coin Gecko 
 4. Go through 2 again and generate a file that includes both token loss and loss in USDC

# Results
 You can reproduce the results by running `npm start` after pluggining your `ETHERSCAN_API_KEY`. The final loss reports will be in `wallet_loss.txt`. 
 You can also view the potential loss in this [google sheet](https://docs.google.com/spreadsheets/d/1LVNk2FN7RJcETChBVtjQE3niIAidWfyAbcQtnHgFpsU/edit#gid=246947807) which is just `wallet_loss.txt` uploaded and sorted. The potential loss is more than $30M compared to the [actual loss of $15.3M](https://docs.google.com/spreadsheets/d/1LVNk2FN7RJcETChBVtjQE3niIAidWfyAbcQtnHgFpsU/edit#gid=2074661653). 

# Further Improvements
 What's a good api call to get the complete list of token approvals at a specific block for a contract without providing a wallet address? That would have been a  more accurate estimate than what we do here. 
 
