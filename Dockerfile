# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory inside container
WORKDIR /app

# Copy package.json and package-lock.json if available
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the application
COPY . .

# Expose the port your server listens on
EXPOSE 4000

# Use environment variables from .env if needed
# (Optional: copy .env)
# COPY .env .env

# Start the server
CMD ["node", "server.js"]
