FROM apify/actor-node:20

# Install system dependencies required for Playwright
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --quiet --only=prod --no-optional

# Install Playwright browsers with dependencies
RUN npx playwright install --with-deps chromium

# Copy source code
COPY . ./

# Run the application
CMD npm start