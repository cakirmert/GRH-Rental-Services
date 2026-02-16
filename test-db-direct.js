const { Client } = require('pg')
require('dotenv').config({ path: '.env.local' })

async function test() {
    console.log('Testing direct PG connection...')
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    })
    try {
        await client.connect()
        console.log('Connected successfully via PG!')
        const res = await client.query('SELECT NOW()')
        console.log('Time from DB:', res.rows[0].now)
    } catch (err) {
        console.error('PG Error:', err)
    } finally {
        await client.end()
    }
}

test()
