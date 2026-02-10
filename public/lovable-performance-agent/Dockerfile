FROM eclipse-temurin:17-jdk-jammy

# Install Node.js and required packages
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    unzip \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Apache JMeter
ENV JMETER_VERSION=5.6.3
ENV JMETER_HOME=/opt/apache-jmeter
ENV PATH="${JMETER_HOME}/bin:${PATH}"

RUN wget -q https://dlcdn.apache.org/jmeter/binaries/apache-jmeter-${JMETER_VERSION}.tgz \
    && tar -xzf apache-jmeter-${JMETER_VERSION}.tgz -C /opt \
    && mv /opt/apache-jmeter-${JMETER_VERSION} ${JMETER_HOME} \
    && rm apache-jmeter-${JMETER_VERSION}.tgz

# Verify JMeter installation
RUN jmeter --version

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json ./

# Copy agent code
COPY run-agent.js ./

# Set environment variables
ENV NODE_ENV=production

# Run the agent
CMD ["npm", "start"]
