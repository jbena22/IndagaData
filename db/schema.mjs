import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';

export const processRequests=sqliteTable('process_requests',{
 id:text('id').primaryKey().notNull(),
 createdAt:integer('created_at').notNull(),
 name:text('name').notNull(),
 problem:text('problem').notNull(),
 dataset:text('dataset').notNull(),
 expected:text('expected').notNull(),
 email:text('email')
},table=>[index('process_requests_created_at').on(table.createdAt)]);
