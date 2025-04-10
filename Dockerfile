FROM node:slim

WORKDIR /app

RUN npm install -g pnpm pm2

COPY package.json ./

RUN pnpm install --prod

COPY . .

CMD ["pm2-runtime", "start", "index.js"]