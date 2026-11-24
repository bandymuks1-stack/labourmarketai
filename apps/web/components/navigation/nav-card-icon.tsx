import {
  Armchair, BarChart3, Blocks, BrickWall, Briefcase, Building2, CalendarCheck, Car, ChefHat,
  ClipboardCheck, ClipboardList, Clock, Code, Coffee, Compass, ConciergeBell, Construction, Croissant,
  Factory, FileSignature, FileText, Flame, Flower2, FolderKanban, Globe, GraduationCap, Grid3x3, Hammer, Hand,
  HandPlatter, Handshake, HardHat, Headset, HeartHandshake, Home, IdCard, Inbox, Info, Languages,
  LayoutGrid, LayoutPanelTop, MessagesSquare, NotebookPen, Package, PaintRoller, Ruler, Scissors, Search,
  ShieldCheck, ShoppingBag, ShowerHead, Shovel, Sparkles, SprayCan, Store, Tractor, Truck,
  UserSearch, Users, Utensils, Warehouse, WashingMachine, Wheat, Wrench, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { NavCardIconKey } from "@/lib/navigation/nav-card-icons";

/** One lucide icon per id — presentation only; the ids live in the lib. */
export const NAV_CARD_ICONS: Record<NavCardIconKey, LucideIcon> = {
  armchair: Armchair, barChart: BarChart3, blocks: Blocks, brickWall: BrickWall,
  briefcase: Briefcase, building: Building2, calendarCheck: CalendarCheck, car: Car,
  chefHat: ChefHat, clipboardCheck: ClipboardCheck, clipboardList: ClipboardList, code: Code,
  coffee: Coffee, compass: Compass, conciergeBell: ConciergeBell, construction: Construction,
  croissant: Croissant, factory: Factory, fileSignature: FileSignature, fileText: FileText,
  flame: Flame, flower: Flower2, globe: Globe, graduationCap: GraduationCap, grid: Grid3x3,
  hammer: Hammer, hand: Hand, handPlatter: HandPlatter, handshake: Handshake, hardHat: HardHat,
  headset: Headset, heartHandshake: HeartHandshake, home: Home, idCard: IdCard, inbox: Inbox,
  info: Info, languages: Languages, layoutGrid: LayoutGrid, layoutPanelTop: LayoutPanelTop,
  messagesSquare: MessagesSquare, package: Package, paintRoller: PaintRoller, ruler: Ruler,
  scissors: Scissors, search: Search, shieldCheck: ShieldCheck, shoppingBag: ShoppingBag,
  showerHead: ShowerHead, shovel: Shovel, sparkles: Sparkles, sprayCan: SprayCan, store: Store,
  tractor: Tractor, truck: Truck, userSearch: UserSearch, users: Users, utensils: Utensils,
  notebook: NotebookPen, clock: Clock, folder: FolderKanban,
  warehouse: Warehouse, washingMachine: WashingMachine, wheat: Wheat, wrench: Wrench, zap: Zap,
};
