-- f-synth-picker t-329: how the synth picker lists synths.
--
-- A user's own changes to it, kept with their other synth page settings (`kys.picker`).
ALTER TABLE "user_preference" ADD COLUMN "picker" JSONB;

-- The site's settings: admin config, one row ("site"). No row means the code's defaults (`FACTORY_PICKER`).
CREATE TABLE "synth_picker_settings" (
    "id" TEXT NOT NULL DEFAULT 'site',
    "group" TEXT NOT NULL,
    "order" TEXT NOT NULL,
    "kinds" TEXT[],
    "thumbs" BOOLEAN NOT NULL,
    "visitorsMayChange" BOOLEAN NOT NULL,
    "offerAll" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "synth_picker_settings_pkey" PRIMARY KEY ("id")
);
