import { router, protectedProcedure } from "@/lib/trpcServer"
import { invoke } from "@/server/modules/shared/trpcAdapter"
import * as inputs from "@/server/modules/administration/contracts"
import * as queries from "@/server/modules/administration/queries"
import * as members from "@/server/modules/administration/members"
import * as inventory from "@/server/modules/administration/inventory"
import * as uploads from "@/server/modules/administration/uploads"
import { retentionProcedures } from "./retentionProcedures"

export const adminRouter = router({
  ...retentionProcedures,
  // Dashboard statistics
  dashboardStats: protectedProcedure.query(({ ctx }) =>
    invoke(ctx, (context) => queries.getDashboardStatistics(context)),
  ),

  rentalTeamMembers: router({
    list: protectedProcedure.query(({ ctx }) =>
      invoke(ctx, (context) => members.listRentalMembers(context)),
    ),
  }),

  itemsDefaults: router({
    list: protectedProcedure.query(({ ctx }) =>
      invoke(ctx, (context) => inventory.listItemResponsibilities(context)),
    ),
    update: protectedProcedure
      .input(inputs.setItemResponsibilitiesInput)
      .mutation(({ ctx, input }) =>
        invoke(ctx, (context) => inventory.setItemResponsibilities(context, input)),
      ),
  }),

  items: router({
    list: protectedProcedure.query(({ ctx }) =>
      invoke(ctx, (context) => inventory.listItems(context)),
    ),
    create: protectedProcedure
      .input(inputs.createItemInput)
      .mutation(({ ctx, input }) => invoke(ctx, (context) => inventory.createItem(context, input))),
    update: protectedProcedure
      .input(inputs.updateItemInput)
      .mutation(({ ctx, input }) => invoke(ctx, (context) => inventory.updateItem(context, input))),
    toggle: protectedProcedure
      .input(inputs.setItemActiveInput)
      .mutation(({ ctx, input }) =>
        invoke(ctx, (context) => inventory.setItemActive(context, input)),
      ),
  }),

  memberManagement: router({
    list: protectedProcedure.query(({ ctx }) =>
      invoke(ctx, (context) => members.listStaff(context)),
    ),
    getDetails: protectedProcedure
      .input(inputs.getMemberDetailsInput)
      .mutation(({ ctx, input }) =>
        invoke(ctx, (context) => members.getMemberDetails(context, input)),
      ),
    add: protectedProcedure
      .input(inputs.addRentalMemberInput)
      .mutation(({ ctx, input }) =>
        invoke(ctx, (context) => members.addRentalMember(context, input)),
      ),
    remove: protectedProcedure
      .input(inputs.removeRentalMemberInput)
      .mutation(({ ctx, input }) =>
        invoke(ctx, (context) => members.removeRentalMember(context, input)),
      ),
    promoteToAdmin: protectedProcedure
      .input(inputs.promoteAdministratorInput)
      .mutation(({ ctx, input }) =>
        invoke(ctx, (context) => members.promoteAdministrator(context, input)),
      ),
    demoteFromAdmin: protectedProcedure
      .input(inputs.demoteAdministratorInput)
      .mutation(({ ctx, input }) =>
        invoke(ctx, (context) => members.demoteAdministrator(context, input)),
      ),
  }),
  // Update the ordering and list of item images
  updateImages: protectedProcedure
    .input(inputs.updateItemImagesInput)
    .mutation(({ ctx, input }) =>
      invoke(ctx, (context) => inventory.updateItemImages(context, input)),
    ),

  staffCancelledBookings: protectedProcedure.query(({ ctx }) =>
    invoke(ctx, (context) => queries.listStaffCancellations(context)),
  ),
})

export const uploadRouter = router({
  uploadItemImage: protectedProcedure
    .input(inputs.uploadItemImageInput)
    .mutation(({ ctx, input }) =>
      invoke(ctx, (context) => uploads.uploadItemImage(context, input)),
    ),
})
