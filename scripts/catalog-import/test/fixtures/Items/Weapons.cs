// Excerpt of OpenMU VersionSeasonSix/Items/Weapons.cs (MIT, (c) 2017 MUnique; see NOTICE). Test fixture only.
namespace MUnique.OpenMU.Persistence.Initialization.VersionSeasonSix.Items;

public class Weapons : InitializerBase
{
    public override void Initialize()
    {
        /// Replace by: this.CreateWeapon($1, $2, $3, "$9");
        this.CreateWeapon(0, 0, 0, 0, 1, 2, true, LocalizedString.FromResource(() => ItemNames.Kris), 6, 6, 11, 50, 20, 0, 0, 40, 40, 0, 0, 1, 1, 1, 1, 1, 1, 1);
        this.CreateWeapon(0, 1, 0, 0, 1, 3, true, LocalizedString.FromResource(() => ItemNames.ShortSword), 3, 3, 7, 20, 22, 0, 0, 60, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1);
        /* this.CreateWeapon(0, 99, 0, 0, 1, 3, true, LocalizedString.FromResource(() => ItemNames.Kris), 1); */
        this.CreateWeapon(5, 0, 0, 0, 1, 3, true, "Literal Staff", 3, 3, 7, 20, 22, 0, 0, 60, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1);
        this.CreateWeapon(5, 1, 0, 0, 1, 3, true, new LocalizedString("Wrapped \"Quoted\" Staff"), 3, 3, 7);
    }

    protected void CreateWeapon(
        byte @group,
        byte number,
        byte slot,
        int skillNumber,
        byte width,
        byte height,
        bool dropsFromMonsters,
        LocalizedString name,
        byte dropLevel)
    {
        var item = this.Context.CreateNew<ItemDefinition>();
        this.GameConfiguration.Items.Add(item);
        item.Name = name;
        item.Group = group;
        item.Number = number;
        if (slot == 0 && width == 1)
        {
            item.Height = height;
        }
    }
}
