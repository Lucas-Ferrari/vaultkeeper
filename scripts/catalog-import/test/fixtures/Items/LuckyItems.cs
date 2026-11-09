// Excerpt of OpenMU VersionSeasonSix/Items/LuckyItems.cs (MIT, (c) 2017 MUnique; see NOTICE). Test fixture only.
namespace MUnique.OpenMU.Persistence.Initialization.VersionSeasonSix.Items;

internal class LuckyItems : InitializerBase
{
    public override void Initialize()
    {
        this.CreateLuckyArmor(62, 7, 2, 2, LocalizedString.FromResource(() => ItemNames.ScaleHelm), 26, 16, 1, CharacterClasses.AllKnights | CharacterClasses.AllLords);
    }
}
