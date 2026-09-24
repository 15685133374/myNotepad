# 微信云托管 Dockerfile
FROM node:18-alpine

WORKDIR /app

# 优先拷贝依赖清单，利用镜像缓存
COPY package*.json ./
RUN npm install --production --registry=https://mirrors.tencent.com/npm/

# 拷贝源码
COPY . .

EXPOSE 80

CMD ["node", "index.js"]
