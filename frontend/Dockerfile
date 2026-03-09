FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

ENV VITE_API_URL=http://backend:8000
ENV VITE_WS_URL=ws://backend:8000

EXPOSE 5173

CMD ["npm", "run", "dev"]
