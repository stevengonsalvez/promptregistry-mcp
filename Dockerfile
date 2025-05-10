# Use an official Node.js runtime as a parent image
# Using Alpine Linux for a smaller image size
FROM node:18-alpine AS builder

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (or yarn.lock)
COPY package.json ./
# If you use package-lock.json, uncomment the next line
# COPY package-lock.json ./
# If you use yarn.lock, uncomment the next line
# COPY yarn.lock ./

# Install app dependencies
# Using --only=production or similar might be desired if devDependencies aren't needed at runtime
# but for simplicity and ensuring `tsc` (from devDependencies) is available, we'll install all for now.
# For a smaller final image, you could use a multi-stage build.
RUN npm install

# Copy the rest of the application source code
COPY . .

# Compile TypeScript to JavaScript
RUN npm run build

# --- Release Stage ---
FROM node:18-alpine

WORKDIR /usr/src/app

# Copy only necessary production files from the builder stage
COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/default_prompts_data ./default_prompts_data

# The server creates 'prompts_data' in its working directory
# and '~/.promptregistry' in the container's user home for global defaults.
# If you want these to persist outside the container or be pre-populated differently,
# you'd use Docker volumes when running the container.
# e.g., docker run -v /path/on/host/prompts_data:/usr/src/app/prompts_data \
#                -v /path/on/host/user_registry:/root/.promptregistry ...
# (Note: The home directory inside the container for the default 'root' user is /root)


# Expose any ports if your server were to listen on a network (not applicable for stdio)
# EXPOSE 3000

# Define the command to run your app
CMD [ "node", "dist/server.js" ]