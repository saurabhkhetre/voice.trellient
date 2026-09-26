-- Dev knowledge corpus for the Dev Test Business: a widget and gadget shop
-- on MG Road, Pune. Applied by scripts/db-init.mjs after the migrations.
--
-- This exists so knowledge retrieval can be evaluated against something
-- realistic. Five placeholder notes were not enough to tell a retrieval
-- improvement from luck, and with a corpus this size the distractors are
-- what make the ranking meaningful.
--
-- Local development data only -- it is not customer content and must never
-- be seeded into a real workspace. Rows are matched on title, so running
-- this again adds nothing and edits made in the dashboard are preserved.

-- The dev business id is the fixed constant from scripts/db-init.mjs. It is a
-- literal rather than a psql variable so this file runs both through psql and
-- through node-postgres, which has no meta-commands.

-- 45 knowledge notes
INSERT INTO agent_knowledge (business_id, title, content, source_type, active)
SELECT '22222222-2222-2222-2222-222222222222', v.title, v.content, 'manual', true
FROM (VALUES
  ('About the shop',
   'Kulkarni Widgets is a family run widget and gadget shop at 12 MG Road, Pune, trading since 2012. There are three of us on the floor and we speak English, Hindi and Marathi. The owner, Mr Kulkarni, is usually in the shop on weekday mornings.'),
  ('Accessories and spare parts',
   'We stock cables, cases, mounts and replacement batteries for everything we sell. Spares for older models can usually be ordered in within a week. Bring the old part or the model number so we match it correctly.'),
  ('Appointments',
   'You do not need an appointment to browse or to drop off a repair. Booking is only needed for a fitting consultation or a bulk order discussion, and those run for about thirty minutes.'),
  ('Bulk orders',
   'For ten units or more we prepare a written quote and the owner calls back the same day. Schools, offices and housing societies can be invoiced monthly instead of paying per order. Bulk pricing starts at five per cent off and improves above fifty units.'),
  ('Busiest times',
   'Saturday afternoons and the first weekend after payday are the busiest. If you want unhurried advice or a demonstration, weekday mornings before noon are much quieter and the owner is usually around.'),
  ('Click and collect',
   'You can order by phone and collect from the shop the same day if the item is in stock. We hold reserved items for three days. Bring the order number and some ID when you come.'),
  ('Complaints',
   'If something has gone wrong, ask for the owner and he will deal with it personally. Most issues are settled the same day in the shop. If you would rather write, leave your number with any of the staff and he will call you back.'),
  ('Contacting us',
   'The shop number is answered during opening hours. Outside hours you can leave a message and we return calls the next working morning, starting with repair enquiries. We do not use WhatsApp for orders.'),
  ('Corporate and school invoicing',
   'We can raise a proforma invoice for approval before supplying, which most schools and government offices need. Purchase orders are accepted by email and we can supply a GST invoice against any order.'),
  ('Data and settings transfer',
   'Bring both the old and the new unit and we will move your settings across while you wait; it takes about twenty minutes. We do not keep a copy of anything, so make your own backup first if the data matters.'),
  ('Delivery within Pune',
   'Orders placed before four in the afternoon ship the same day. Delivery inside Pune takes one to two working days and is free above two thousand rupees. Below that there is a flat charge of eighty rupees.'),
  ('Demonstrations and trying before buying',
   'We keep working display units of the main models and you are welcome to try them on the counter. We cannot let stock units be opened for testing, but a demonstration unit will show you exactly the same thing.'),
  ('Deposits on special orders',
   'Anything we have to order in specially needs a thirty per cent deposit up front. The deposit is refundable if the supplier cannot fulfil the order, but not if you simply change your mind after it has shipped to us.'),
  ('Environmental policy',
   'Our packaging is card and paper rather than plastic wherever the supplier allows it. We run the shop on a solar assisted connection and we recycle all returned electronics through a certified handler in Pimpri.'),
  ('Exchanges',
   'An unopened item can be swapped for a different model within seven days; you pay or we refund the difference. Opened items can only be exchanged if there is a fault. Clearance and ex display stock cannot be exchanged.'),
  ('Extended cover',
   'An extended cover plan is available on any new widget for an extra year or two years, bought at the time of purchase or within thirty days of it. It works the same way as the standard warranty and is transferable if you sell the unit.'),
  ('Faulty on arrival',
   'If something is dead out of the box, tell us within forty eight hours and we replace it outright rather than repairing it. Keep the packaging until you have tested the unit, because a replacement needs the original box.'),
  ('Festival and holiday hours',
   'During Diwali we usually open late, until ten at night, for about a week. We are shut on Ganesh Chaturthi and on Independence Day. Holiday timings are announced in the shop and on the phone greeting a few days ahead.'),
  ('Getting here by public transport',
   'The nearest bus stop is MG Road Post Office, served by routes 14, 22 and 145. From Pune station it is about fifteen minutes by auto. If you are coming by Metro, Civil Court is the closest station and it is a ten minute walk from there.'),
  ('Gift cards',
   'Gift cards are available in denominations from five hundred to ten thousand rupees. They are valid for one year from purchase, can be used against repairs as well as goods, and cannot be exchanged for cash.'),
  ('Gift wrapping and gift receipts',
   'We gift wrap free of charge during the festival season and for twenty rupees the rest of the year. Ask for a gift receipt and the recipient can exchange the item without ever seeing the price.'),
  ('Instalments and EMI',
   'Card EMI is available on most banks for purchases above eight thousand rupees, over three, six or nine months. The bank decides eligibility, not us. There is no additional charge from the shop for choosing EMI.'),
  ('Insurance documentation',
   'If you need paperwork for an insurance claim we can provide a written statement of the fault and a valuation on shop letterhead. There is no charge for this if the unit was bought here, otherwise it is two hundred rupees.'),
  ('Job vacancies',
   'We take on one apprentice most years, usually starting after the exam season. If you are interested, drop a CV into the shop addressed to the owner. We do not advertise positions online.'),
  ('Languages we speak',
   'All three of us speak English, Hindi and Marathi fluently. The owner also has some Gujarati. If you would rather be served in a particular language, just say so when you call and we will pass you to the right person.'),
  ('Lost receipts',
   'If you have lost your invoice we can look up the purchase from your phone number or the card you paid with, as long as it was bought here. A reprint is enough for a warranty claim but not for a cash refund.'),
  ('Opening hours',
   'We are open Monday to Saturday from nine in the morning until eight in the evening. We close on Sundays and on public holidays. The repair counter closes half an hour before the shop does.'),
  ('Parking and directions',
   'We are on MG Road directly opposite the post office, two doors down from the Bank of Maharashtra ATM. Free customer parking is behind the building; the entrance is from the side lane, not from MG Road itself. There is space for about eight cars and it is rarely full on weekdays.'),
  ('Payment methods',
   'We accept UPI, all major debit and credit cards, and cash. Cash on delivery is available inside Pune for orders under ten thousand rupees. We do not accept cheques from individuals, only from registered businesses with a trade account.'),
  ('Pets and children',
   'Well behaved dogs on a lead are welcome in the shop. There is a small seating corner near the repair counter where children can wait, but please keep an eye on them as the display units are fragile.'),
  ('Price matching',
   'If you find the same model cheaper at another Pune shop we will usually match it, provided the item is in stock there and it is not a clearance or grey import price. Show us the quote or the listing and we will confirm.'),
  ('Recycling and trade in',
   'We take back old widgets for recycling free of charge whether or not you bought them here. If the unit still works we may offer a trade in value against a new purchase, assessed at the counter.'),
  ('Repair loan units',
   'If your repair will take more than five days we can usually lend you a basic loan unit at no charge. There are four in the pool so it depends on availability, and we ask for an ID and a refundable deposit of five hundred rupees.'),
  ('Repairs turnaround',
   'Most repairs are finished within three working days. If a part has to be ordered it can take up to ten days, and we always call with an estimate before doing any chargeable work. Simple fixes like a loose connector are often done while you wait.'),
  ('Returns and refunds',
   'Unopened items can be returned within seven days with the invoice for a full refund. Opened items are exchange or credit note only, provided everything is in the box. Refunds go back to the original payment method and take three to five days to appear.'),
  ('Security and theft',
   'Every unit we sell is recorded against its serial number. If yours is stolen, call us with the invoice number and we will flag it, so if it is ever brought in for repair we will know.'),
  ('Setup and installation',
   'We will set up any widget you buy from us free of charge at the counter, including transferring your settings from an old unit. On site installation at your home or office inside Pune is charged at five hundred rupees.'),
  ('Shipping outside Pune',
   'We ship anywhere in Maharashtra by courier, typically three to five working days. Outside the state it is five to seven days. Courier charges are quoted at the time of order and depend on weight and destination.'),
  ('Stock and availability',
   'Most standard widgets are in stock on the shelf. Anything in the Pro range or a specific colour may need ordering in, which usually takes four to six working days. We can check stock over the phone before you travel.'),
  ('Student and senior discounts',
   'Students with a valid college ID and customers over sixty five get five per cent off accessories. The discount does not apply to the Pro range or to anything already reduced, and it cannot be combined with bulk pricing.'),
  ('Trade and reseller accounts',
   'Registered businesses can open a trade account with a GST number and one reference. Trade accounts get thirty day payment terms, priority on repairs, and a dedicated number that skips the queue. Ask for the owner to start the paperwork.'),
  ('Warranty',
   'Every widget carries a twelve month manufacturer warranty from the date on the invoice. The Widget Pro range carries twenty four months. Bring the invoice to the shop, or call us and we will arrange a pickup at no cost within Pune.'),
  ('What the warranty does not cover',
   'The warranty covers manufacturing faults only. Accidental damage, liquid damage, cracked casings and normal wear on cables are not covered. We will still quote you for the repair, and out of warranty work is charged at our standard rate.'),
  ('What we can repair',
   'We service every widget and gadget we sell, plus most major brands bought elsewhere. We do not repair water damaged units or anything that has already been opened by another shop, because we cannot warrant the result.'),
  ('Wheelchair access',
   'The shop entrance has a single low step and we keep a portable ramp behind the counter. Just call ahead or knock and someone will bring it out. The aisles inside are wide enough for a wheelchair and the counter has a lowered section.')
) AS v(title, content)
WHERE NOT EXISTS (
  SELECT 1 FROM agent_knowledge k
   WHERE k.business_id = '22222222-2222-2222-2222-222222222222' AND k.title = v.title
);

-- 15 business policies
INSERT INTO business_policies (business_id, policy_type, title, content, active)
SELECT '22222222-2222-2222-2222-222222222222', v.policy_type, v.title, v.content, true
FROM (VALUES
  ('cancellation', 'Cancellations',
   'Appointments can be moved or cancelled free of charge up to two hours before the slot. Later than that, or a no show, and we may ask for a deposit before booking again. Special orders already shipped to us cannot be cancelled.'),
  ('delivery', 'Delivery',
   'Orders placed before 4 pm ship the same day. Delivery within Pune takes one to two working days and is free on orders above two thousand rupees, otherwise eighty rupees. Elsewhere in Maharashtra allow three to five working days.'),
  ('delivery', 'Failed deliveries',
   'The courier attempts delivery twice. After a second failure the parcel returns to the shop and we hold it for fourteen days. Redelivery is charged at the standard rate; a refund after return is less the original delivery cost.'),
  ('hours', 'Holiday closures',
   'The shop is closed on Ganesh Chaturthi and Independence Day. During Diwali week we extend closing to 10 pm. Any change to normal hours is announced on the phone greeting at least three days in advance.'),
  ('hours', 'Opening hours',
   'We trade Monday to Saturday, 9 am to 8 pm, at 12 MG Road, Pune. We are closed on Sundays and public holidays. The repair counter shuts at 7.30 pm, half an hour before the shop.'),
  ('payment', 'Credit terms',
   'Trade accounts are invoiced on thirty day terms from the invoice date. Accounts more than fifteen days overdue are placed on hold until cleared. Interest is not charged, but priority repair service is suspended while an account is overdue.'),
  ('payment', 'Payment',
   'We accept UPI, all major debit and credit cards, and cash. Cash on delivery is available inside Pune for orders below ten thousand rupees. Cheques are accepted only from registered businesses holding a trade account.'),
  ('pricing', 'Discounts',
   'Student and senior discounts are five per cent on accessories, not on the Pro range or reduced stock. Bulk pricing starts at five per cent for ten units and improves above fifty. Discounts do not stack and any further reduction needs approval from the owner.'),
  ('pricing', 'Price matching',
   'We match any in stock price from another Pune retailer on an identical model, excluding clearance, grey imports and online marketplace sellers. Proof is required at the time of purchase and matched prices cannot be combined with other discounts.'),
  ('privacy', 'Customer data',
   'We hold your name, phone number and purchase history so we can honour warranties and look up lost invoices. We do not sell or share customer data with anyone. Ask at the counter and we will delete your record, except where an invoice must be retained for tax.'),
  ('returns', 'Non returnable items',
   'Gift cards, clearance stock, ex display units and any item with a broken security seal cannot be returned or exchanged unless faulty. This does not affect your statutory rights where the goods are defective.'),
  ('returns', 'Refund timing and method',
   'Refunds are issued to the original payment method. Card and UPI refunds take three to five working days to appear. Cash purchases over five thousand rupees are refunded by bank transfer, not cash, and need account details.'),
  ('returns', 'Returns',
   'Unopened goods may be returned within 7 days of purchase with the original invoice for a full refund. Opened goods are eligible for exchange or a credit note only, and all original contents and packaging must be present.'),
  ('warranty', 'Warranty claims',
   'Widgets carry a twelve month manufacturer warranty; the Widget Pro range carries twenty four months. Claims need the original invoice or a reprint. We arrange free pickup and return within Pune for warranty repairs.'),
  ('warranty', 'Warranty exclusions',
   'Manufacturing defects only. Accidental damage, liquid ingress, cracked housings, and wear on cables and batteries beyond six months are excluded. Unauthorised repair by a third party voids the warranty entirely.')
) AS v(policy_type, title, content)
WHERE NOT EXISTS (
  SELECT 1 FROM business_policies p
   WHERE p.business_id = '22222222-2222-2222-2222-222222222222' AND p.title = v.title
);
