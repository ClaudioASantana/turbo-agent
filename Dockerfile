FROM node:22-bookworm-slim

WORKDIR /app

# Install native build tools for node-pty and sqlite on Debian
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/* 

COPY package*.json ./
RUN npm install

COPY . .

# Expose API port (assuming server.ts uses 3000)
EXPOSE 3000

CMD ["npx", "tsx", "src/server.ts"]
