FROM apify/actor-node-playwright:20

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --quiet --only=prod --no-optional

# Copy source code
COPY . ./

# Run the application
CMD npm start