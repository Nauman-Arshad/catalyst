// Seeds demo data for the integer-ID schema.
// Run with:  node --env-file=.env db/seed.mjs
import postgres from "postgres";

const sql = postgres(process.env.SUPABASE_CONNECTION_STRING, { ssl: "require" });

async function main() {
  const [{ count }] = await sql`select count(*)::int as count from parties`;
  if (count > 0) {
    console.log(`Parties already exist (${count}); skipping seed.`);
    return;
  }

  console.log("Seeding demo data…");

  const parties = await sql`
    insert into parties (name, phone, address, status, opening_balance)
    values
      ('Apex Hardware & Paints', '+92 300 1234567', 'Saddar, Karachi', 'active', 0),
      ('Brilliance Auto Refinish', '+92 321 9876543', 'Gulberg, Lahore', 'active', 5000),
      ('Coral Coatings', '+92 333 5556677', 'Hayatabad, Peshawar', 'active', 0),
      ('Metro Builders', '+92 301 1112233', 'Blue Area, Islamabad', 'inactive', -2000)
    returning id, name
  `;
  const byName = Object.fromEntries(parties.map((p) => [p.name, p.id]));

  const products = await sql`
    insert into products (name, unit_price)
    values
      ('Premium White Emulsion (1L)', 320),
      ('Cobalt Blue Enamel (1L)', 410),
      ('Industrial Thinner (5L)', 725),
      ('Epoxy Hardener (1kg)', 690),
      ('Metal Primer Grey (20L)', 3600)
    returning id, name
  `;
  const prod = Object.fromEntries(products.map((p) => [p.name, p.id]));

  const partyId = byName["Apex Hardware & Paints"];
  const orderNumber = `ORD-${Date.now()}`;
  const [order] = await sql`
    insert into orders (order_number, party_id, order_date, status, advance_payment)
    values (${orderNumber}, ${partyId}, current_date - 5, 'progress', 5000)
    returning id
  `;
  await sql`
    insert into order_items (order_id, product_id, quantity, unit_price)
    values
      (${order.id}, ${prod["Premium White Emulsion (1L)"]}, 24, 320),
      (${order.id}, ${prod["Industrial Thinner (5L)"]}, 10, 725)
  `;
  // Advance payment recorded against the order.
  await sql`
    insert into payments (party_id, order_id, amount, payment_date)
    values (${partyId}, ${order.id}, 5000, current_date - 5)
  `;

  console.log(`Seeded 4 parties, 5 products, order ${orderNumber}, 1 payment.`);
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error("Seed failed:", e.message);
    await sql.end();
    process.exit(1);
  });
