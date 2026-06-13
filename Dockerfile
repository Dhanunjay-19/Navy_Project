# Stage 1: Build the application using Maven
FROM maven:3.8.5-openjdk-17 AS build
WORKDIR /app
# Copy your pom.xml and source code
COPY pom.xml .
COPY src ./src
# Build the jar file
RUN mvn clean package -DskipTests

# Stage 2: Run the application
FROM openjdk:17.0.1-jdk-slim
WORKDIR /app
# Copy the built jar from the previous stage
COPY --from=build /app/target/*.jar app.jar
# Expose the port
EXPOSE 8080
# Start the Spring Boot app
ENTRYPOINT ["java","-jar","app.jar"]