// test-all-connections.js - Test all Supabase connection methods
const { PrismaClient } = require('@prisma/client');

const connections = [
  {
    name: "Transaction Pooler",
    url: "postgresql://postgres.megjoogojbtiqyjxfnve:MADHAV%402005joshi@aws-0-ap-south-1.pooler.supabase.com:6543/postgres",
    description: "Recommended for serverless/development"
  },
  {
    name: "Session Pooler", 
    url: "postgresql://postgres.megjoogojbtiqyjxfnve:MADHAV%402005joshi@aws-0-ap-south-1.pooler.supabase.com:5432/postgres",
    description: "Alternative pooler method"
  },
  {
    name: "Direct Connection",
    url: "postgresql://postgres:MADHAV%402005joshi@db.megjoogojbtiqyjxfnve.supabase.co:5432/postgres", 
    description: "Direct database connection"
  }
];

async function testConnection(config) {
  console.log(`\n🧪 Testing: ${config.name}`);
  console.log(`📝 Description: ${config.description}`);
  console.log(`🔗 URL: ${config.url.replace(/:[^:@]*@/, ':***@')}`);
  
  const prisma = new PrismaClient({
    datasources: {
      db: { url: config.url }
    },
    log: ['error'] // Only show errors
  });

  try {
    console.log('⏳ Connecting...');
    
    // Set a timeout for the connection attempt
    const connectPromise = prisma.$connect();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timeout after 10 seconds')), 10000)
    );
    
    await Promise.race([connectPromise, timeoutPromise]);
    console.log('✅ Connection successful!');
    
    // Test a simple query
    console.log('⏳ Testing query...');
    const result = await prisma.$queryRaw`SELECT 'Connection working!' as status, NOW() as timestamp`;
    console.log('✅ Query successful:', result);
    
    await prisma.$disconnect();
    console.log('🎉 SUCCESS! This connection works perfectly.');
    console.log(`💡 Use this in your .env: DATABASE_URL="${config.url}"`);
    return true;
    
  } catch (error) {
    console.log('❌ Failed:', error.message);
    await prisma.$disconnect();
    return false;
  }
}

async function testAllConnections() {
  console.log('🔍 Testing all Supabase connection methods...\n');
  
  let workingConnection = null;
  
  for (const config of connections) {
    const success = await testConnection(config);
    if (success && !workingConnection) {
      workingConnection = config;
      break; // Stop at first working connection
    }
    
    // Wait a bit between attempts
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  if (workingConnection) {
    console.log('\n🎉 SOLUTION FOUND!');
    console.log(`✅ Working connection: ${workingConnection.name}`);
    console.log(`📋 Copy this to your .env file:`);
    console.log(`DATABASE_URL="${workingConnection.url}"`);
  } else {
    console.log('\n❌ No connections worked. Possible issues:');
    console.log('1. Supabase project is paused');
    console.log('2. Wrong password');
    console.log('3. Network/firewall blocking connections');
    console.log('4. Check Supabase dashboard for project status');
  }
}

testAllConnections().catch(console.error);