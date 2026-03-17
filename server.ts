import './src/server/bootstrap-env'

const [{ default: homepage }, { startServer }] = await Promise.all([import('./index.html'), import('./src/server/index')])

startServer(homepage)
