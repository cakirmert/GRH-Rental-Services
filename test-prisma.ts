import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
import * as fs from 'fs'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

console.log('DATABASE_URL defined:', !!process.env.DATABASE_URL)
if (process.env.DATABASE_URL) {
    console.log('DATABASE_URL prefix:', process.env.DATABASE_URL.split(':')[0])
}

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL + "&pgbouncer=true"
        }
    }
})

async function main() {
    console.log('Testing Prisma connection...')
    try {
        const items = await prisma.item.findMany({
            where: { active: true },
            take: 1
        })
        console.log('Connection successful!')
        console.log('Items found:', items.length)
    } catch (err: any) {
        console.error('Prisma Error Details:', JSON.stringify(err, null, 2))
        console.error('Error Message:', err.message)
        if (err.clientVersion) console.error('Client Version:', err.clientVersion)
        fs.writeFileSync('prisma-debug.json', JSON.stringify({
            message: err.message,
            clientVersion: err.clientVersion,
            stack: err.stack,
            ...err
        }, null, 2))
        console.error('Error written to prisma-debug.json')
    } finally {
        await prisma.$disconnect()
    }
}

main()
