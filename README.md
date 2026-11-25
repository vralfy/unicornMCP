# UnicornMCP

Welcome to UnicornMCP! 🦄✨

UnicornMCP is a magical Model Context Protocol (MCP) server for managing unicorn missions in a sparkling city full of rainbow roads and enchanted creatures. Dispatch unicorn vehicles, resolve magical incidents, and keep the city shining with joy!

## What is MCP?

The Model Context Protocol (MCP) is a standardized protocol that enables seamless communication between AI assistants and various tools, resources, and data sources. Think of it as a magical bridge that connects your AI assistant to external services and capabilities! ✨

MCP allows AI assistants to:

- **Access Tools**: Execute functions and commands in external systems
- **Read Resources**: Fetch data from files, databases, APIs, and other sources
- **Maintain Context**: Keep track of ongoing conversations and state across interactions
- **Extend Capabilities**: Add new functionality through modular components called "servers"

In our enchanted unicorn world, MCP acts as the magical communication system that lets AI assistants interact with our unicorn dispatch system, manage missions, assign vehicles, and spread joy throughout the rainbow city! 🌈

The protocol is designed to be:

- **Secure**: All communications are properly authenticated and authorized
- **Extensible**: New tools and resources can be easily added
- **Standardized**: Works consistently across different AI assistants and platforms
- **Magical**: Okay, maybe that last one is just for our unicorn implementation! 🦄💖

## This Project

### Features

- Mission creation and assignment
- Real-time status updates
- Resource management (unicorns, snacks, polish, etc.)
- Fun, interactive UI elements (rainbow progress bars, horn shine meters)
- Automatic vehicle assignment for missions

### Magical Missions

- **Unicorn Jam Clearance**:
  - Clear unicorn traffic jams with Wranglers and Guides.
  - A group of unicorns is blocking a rainbow intersection. Dispatch “Unicorn Wranglers” to clear the jam.
- **Rainbow Road Repair**:
  - Restore faded rainbow roads with Engineers.
  - A section of the rainbow road has faded. Send “Rainbow Engineers” to restore its colors.
- **Horn Polishing Emergency**:
  - Polish unicorn horns before parades with Polishers.
  - A unicorn’s horn has lost its shine before a parade. Assign “Horn Polishers” for a quick fix.
- **Magical Snack Delivery**:
  - Deliver enchanted treats with Couriers.
  - Unicorns are hungry and refuse to move. Send “Snack Couriers” with enchanted treats.
- **Lost Pegasus Assistance**:
  - Help lost pegasi with Guides and Wranglers.
  - A confused pegasus is causing traffic chaos. Deploy “Pegasus Guides” to help.

### Vehicles/Units

- Unicorn Wrangler
- Rainbow Engineer
- Horn Polisher
- Snack Courier
- Pegasus Guide

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the MCP server:

   ```bash
   npm run server # to run as a server
   npm run cli    # to run as cli tool (mostly used by your IDE)
   ```

3. Configure your magical missions and vehicles in `config.json`.

4. Register the server in Claude Code (user scope, absolute path filled in automatically):

   ```bash
   npm run mcp:add              # or: npm run mcp:add -- project | --dry-run
   ```

   Manual alternative: see the examples in `.claude.json`.

## Project Structure

- `mcpcli.ts` - Main MCP server script
- `config.json` - Configuration file
- `mcp.log` - Log file
- `mods/` - Additional mods for this mcp server
- `stuff/` - Additional resources and conversations
- `tmp/` - Temporary files

## License

See LICENSE for details.

---

Made with love, rainbows, and the magic of friendship by Mister Fluffy 🦄💖
