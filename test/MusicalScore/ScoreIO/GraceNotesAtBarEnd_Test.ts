import { OpenSheetMusicDisplay } from "../../../src/OpenSheetMusicDisplay/OpenSheetMusicDisplay";
import { SourceMeasure } from "../../../src/MusicalScore/VoiceData/SourceMeasure";
import { TestUtils } from "../../Util/TestUtils";

function score(partContent: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">${partContent}</part>
</score-partwise>`;
}

const ATTRIBUTES: string = `<attributes><divisions>8</divisions><key><fifths>0</fifths></key>
  <time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>`;

function note(step: string, duration: number, type: string): string {
    return `<note><pitch><step>${step}</step><octave>5</octave></pitch><duration>${duration}</duration><voice>1</voice>
  <type>${type}</type></note>`;
}

function grace(step: string): string {
    return `<note><grace/><pitch><step>${step}</step><octave>5</octave></pitch><voice>1</voice><type>16th</type></note>`;
}

/** A 4/4 bar ending in two grace notes after its last note (as MuseScore writes "grace notes after"), then a bar. */
const GRACE_NOTES_AFTER: string = score(`<measure number="1">${ATTRIBUTES}
  ${note("C", 8, "quarter")}${note("D", 8, "quarter")}${note("E", 16, "half")}${grace("F")}${grace("E")}
</measure><measure number="2">${note("D", 32, "whole")}</measure>`);

/** The same bar with its grace notes before a note, mid-bar (already right). */
const GRACE_NOTES_BEFORE: string = score(`<measure number="1">${ATTRIBUTES}
  ${note("C", 8, "quarter")}${grace("F")}${grace("E")}${note("D", 8, "quarter")}${note("E", 16, "half")}
</measure><measure number="2">${note("D", 32, "whole")}</measure>`);

function load(xml: string): Promise<SourceMeasure[]> {
    const div: HTMLElement = TestUtils.getDivElement(document);
    const osmd: OpenSheetMusicDisplay = new OpenSheetMusicDisplay(div, { autoResize: false, backend: "svg" });
    return osmd.load(xml).then(() => {
        osmd.render();
        return osmd.Sheet.SourceMeasures;
    });
}

describe("Grace notes at the end of a bar", () => {
    it("do not lengthen the bar: the next bar starts on time", () => {
        return load(GRACE_NOTES_AFTER).then((measures: SourceMeasure[]) => {
            chai.expect(measures[0].Duration.RealValue).to.equal(1);
            chai.expect(measures[1].AbsoluteTimestamp.RealValue).to.equal(1);
        });
    });

    it("are still read, at the bar's end", () => {
        return load(GRACE_NOTES_AFTER).then((measures: SourceMeasure[]) => {
            const graceEntries: number = measures[0].VerticalSourceStaffEntryContainers
                .flatMap((container) => container.StaffEntries)
                .filter((entry) => entry !== undefined)
                .flatMap((entry) => entry.VoiceEntries)
                .filter((voiceEntry) => voiceEntry.IsGrace)
                .reduce((count, voiceEntry) => count + voiceEntry.Notes.length, 0);
            chai.expect(graceEntries).to.equal(2);
        });
    });

    it("leave a bar with grace notes before a note as it was", () => {
        return load(GRACE_NOTES_BEFORE).then((measures: SourceMeasure[]) => {
            chai.expect(measures[0].Duration.RealValue).to.equal(1);
            chai.expect(measures[1].AbsoluteTimestamp.RealValue).to.equal(1);
        });
    });
});
