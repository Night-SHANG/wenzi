import type { ModuleDefinition } from '../contracts.ts';
import { walletModule } from './wallet.ts';
import { shopRulesModule } from './shop-rules.ts';
import { priceFixedModule, priceStockModule } from './trade-price.ts';
import { commerceModule } from './commerce.ts';
import { calendarModule } from './calendar.ts';
import { availabilityAlwaysModule, availabilityScheduleModule } from './availability.ts';
import { settlementViewModule } from './settlement-view.ts';
import { workshopViewModule } from './workshop-view.ts';

export const settlementModules: ModuleDefinition[] = [
  walletModule, shopRulesModule, priceFixedModule, priceStockModule, commerceModule,
  calendarModule, availabilityAlwaysModule, availabilityScheduleModule,
  settlementViewModule, workshopViewModule,
];
