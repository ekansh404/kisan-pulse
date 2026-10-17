-- DEMO partner listings (fake people, fake numbers). Run after schema.sql.
-- Spread around Lucknow + Barabanki so distances look real in the demo.
delete from partners;

insert into partners (type, name, name_hi, village, district, lat, lon, phone, rate, rate_unit, rating, details) values
-- Machines (₹ per hour)
('machine','Suresh Yadav','सुरेश यादव','Bakshi Ka Talab','Lucknow',26.980,80.930,'9000000001',800,'hour',4.6,'{"machine":"Tractor + Rotavator","machine_hi":"ट्रैक्टर + रोटावेटर","tags":["tractor","rotavator","jutai","ट्रैक्टर","जुताई"]}'),
('machine','Anil Verma','अनिल वर्मा','Malihabad','Lucknow',26.920,80.710,'9000000002',750,'hour',4.3,'{"machine":"Tractor + Cultivator","machine_hi":"ट्रैक्टर + कल्टीवेटर","tags":["tractor","cultivator","ट्रैक्टर"]}'),
('machine','Mohan Singh','मोहन सिंह','Dewa','Barabanki',26.990,81.170,'9000000003',2200,'hour',4.7,'{"machine":"Combine Harvester","machine_hi":"कंबाइन हार्वेस्टर","tags":["harvester","combine","katai","कटाई","हार्वेस्टर"]}'),
('machine','Ramesh Pal','रमेश पाल','Mohanlalganj','Lucknow',26.680,80.980,'9000000004',600,'hour',4.4,'{"machine":"Seed Drill","machine_hi":"सीड ड्रिल","tags":["seed drill","buvai","बुवाई"]}'),
('machine','Kisan Seva Kendra (CHC)','किसान सेवा केंद्र (CHC)','Chinhat','Lucknow',26.880,81.040,'9000000005',700,'hour',4.5,'{"machine":"Tractor, Sprayer, Thresher","machine_hi":"ट्रैक्टर, स्प्रेयर, थ्रेशर","tags":["tractor","sprayer","thresher","ट्रैक्टर","थ्रेशर"]}'),

-- Agricultural stores (seeds, fertiliser, pesticide)
('store','Gupta Khad Bhandar','गुप्ता खाद भंडार','Malihabad','Lucknow',26.925,80.715,'9000000011',null,'item',4.4,'{"items":["Urea","DAP","NPK","Wheat seed HD-2967","Zinc sulphate"],"tags":["urea","dap","khad","beej","यूरिया","खाद","बीज"]}'),
('store','Krishi Seva Kendra (Govt)','कृषि सेवा केंद्र (सरकारी)','Bakshi Ka Talab','Lucknow',26.975,80.925,'9000000012',null,'item',4.6,'{"items":["Urea (subsidised)","DAP (subsidised)","Certified seed"],"tags":["urea","dap","subsidy","यूरिया","डीएपी"]}'),
('store','Kisan Agro Centre','किसान एग्रो सेंटर','Dewa','Barabanki',26.985,81.165,'9000000013',null,'item',4.2,'{"items":["Chlorpyrifos","Mancozeb","Imidacloprid","Sprayer pump"],"tags":["dawai","pesticide","spray","दवाई","कीटनाशक"]}'),
('store','Shri Ram Beej Bhandar','श्री राम बीज भंडार','Mohanlalganj','Lucknow',26.685,80.985,'9000000014',null,'item',4.3,'{"items":["Paddy seed","Mustard seed","Potato seed","Vegetable seeds"],"tags":["beej","seed","बीज","आलू"]}'),

-- Labour (₹ per day per person)
('labour','Raju ki Toli (5 log)','राजू की टोली (5 लोग)','Itaunja','Lucknow',27.080,80.890,'9000000021',400,'day',4.5,'{"size":5,"skills":["katai","buvai","harvest","sowing"],"tags":["katai","कटाई","बुवाई"]}'),
('labour','Kamla Devi Samuh (3 log)','कमला देवी समूह (3 लोग)','Kakori','Lucknow',26.870,80.790,'9000000022',350,'day',4.6,'{"size":3,"skills":["nirai","weeding","katai"],"tags":["nirai","निराई","कटाई"]}'),
('labour','Shyam Lal Group (8 log)','श्याम लाल ग्रुप (8 लोग)','Ramnagar','Barabanki',27.080,81.480,'9000000023',380,'day',4.2,'{"size":8,"skills":["rice transplanting","ropai","katai"],"tags":["ropai","रोपाई","धान"]}'),
('labour','Vinod Kumar (2 log)','विनोद कुमार (2 लोग)','Gosainganj','Lucknow',26.770,81.120,'9000000024',420,'day',4.4,'{"size":2,"skills":["spraying","irrigation"],"tags":["chhidkav","छिड़काव","सिंचाई"]}'),

-- Buyers (₹ per quintal offer)
('buyer','Govt Procurement Centre (PCF)','सरकारी क्रय केंद्र (PCF)','Bakshi Ka Talab','Lucknow',26.970,80.935,'9000000031',2585,'quintal',4.7,'{"crops":["wheat","गेहूं"],"note":"MSP purchase, payment to bank","tags":["wheat","gehun","गेहूं","msp"]}'),
('buyer','Shri Ram Traders','श्री राम ट्रेडर्स','Naveen Galla Mandi','Lucknow',26.810,80.900,'9000000032',2520,'quintal',4.3,'{"crops":["wheat","mustard","गेहूं","सरसों"],"note":"Cash payment","tags":["wheat","mustard","गेहूं","सरसों"]}'),
('buyer','Barabanki FPO','बाराबंकी FPO','Barabanki','Barabanki',26.930,81.190,'9000000033',2550,'quintal',4.5,'{"crops":["wheat","paddy","potato","गेहूं","धान","आलू"],"note":"Farmer producer organisation","tags":["fpo","paddy","dhan","धान","आलू"]}'),
('buyer','Awadh Agro Foods','अवध एग्रो फ़ूड्स','Chinhat','Lucknow',26.885,81.045,'9000000034',1600,'quintal',4.1,'{"crops":["potato","onion","आलू","प्याज"],"note":"Cold storage pickup","tags":["potato","aloo","आलू","प्याज"]}');