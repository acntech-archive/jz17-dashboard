# Dashboard

Sample development dashboard used in JavaZone 2017 talk.

Communicates with a private docker registry, Rundeck and the docker daemon to aggregate information about running services.

Start in dev mode:
`npm run dev`

Build and run Docker image:
`docker build -t dashboard . && docker run -d -p 3000:3000 dashboard`