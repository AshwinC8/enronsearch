FROM maven:3.8-eclipse-temurin-8 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
COPY public ./public
RUN mvn clean package -DskipTests
RUN mvn dependency:copy-dependencies

FROM eclipse-temurin:8-jre
WORKDIR /app
COPY --from=build /app/target/classes ./target/classes
COPY --from=build /app/target/dependency ./target/dependency
COPY --from=build /app/public ./public

ENV ES_HOST=elasticsearch
ENV ES_PORT=9300
ENV ES_CLUSTER_NAME=elasticsearch
ENV PORT=4567

EXPOSE 4567

CMD ["java", "-Xms64m", "-Xmx128m", "-cp", "target/classes:target/dependency/*:.", "com.bcoe.enronsearch.Cli", "--server"]
