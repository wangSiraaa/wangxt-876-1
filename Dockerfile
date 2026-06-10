FROM node:20-alpine

WORKDIR /app

COPY server/package.json ./server/
RUN cd server && npm install --production=false

COPY server/src ./server/src
COPY server/data ./server/data
COPY server/uploads ./server/uploads

RUN mkdir -p /app/server/data /app/server/uploads

WORKDIR /app/server

EXPOSE 3000

CMD ["sh", "-c", "node src/seeders/initData.js && node src/app.js"]
