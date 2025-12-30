# CroGas Demo - Agent Gas Station
# Records a GIF demo of the CLI tool

Output "CroGas-Demo.gif"

Set Shell "bash"
Set FontSize 14
Set Width 900
Set Height 600
Set Theme "Catppuccin Mocha"
Set Padding 20

# Title
Type "# ⛽ Agent Gas Station Demo - Cronos Testnet"
Enter
Sleep 1s

Type "# Problem: AI agents earn USDC but need CRO for gas"
Enter
Type "# Solution: Pay gas fees with USDC via x402 protocol"
Enter
Sleep 2s

Enter
Type "# Let's see it in action!"
Enter
Sleep 1s

# Run the automated demo
Type "npx tsx cli/record-demo.ts"
Enter
Sleep 35s

# Final message
Type ""
Enter
Type "# ✅ Agent executed transaction with ZERO CRO!"
Enter
Type "# 🎉 Gas Station paid the gas, agent paid with USDC"
Enter
Sleep 3s
