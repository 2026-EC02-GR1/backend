import app from "./src/app"

const PORT = Number(process.env.PORT ?? 3000)

app.listen(PORT, () => {
	console.log(`Résa API listening on http://localhost:${PORT}`)
})
