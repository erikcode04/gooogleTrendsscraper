FROM apify/actor-node:20

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --quiet --only=prod --no-optional

# Install Playwright browsers
RUN npx playwright install chromium

# Copy source code
COPY . ./

# Run the application
CMD npm start